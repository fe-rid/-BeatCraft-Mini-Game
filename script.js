/* ---------- State ---------- */
const state = {
  screen:'start',
  currentLevelId:null,
  unlockedLevels:[1],
  highScores:{},
  audioEnabled:true,
  motionReduced:false
};

const levels = [
  {id:1, name:'First Pulse',  bpm:80,  duration:30, difficulty:'Easy',   density:.45, color:'coral'},
  {id:2, name:'Sunny Step',   bpm:90,  duration:32, difficulty:'Easy',   density:.50, color:'yellow'},
  {id:3, name:'Green Groove', bpm:100, duration:34, difficulty:'Easy',   density:.55, color:'green'},
  {id:4, name:'Sky Walk',     bpm:110, duration:36, difficulty:'Medium', density:.62, color:'sky'},
  {id:5, name:'Coral Riff',   bpm:118, duration:38, difficulty:'Medium', density:.68, color:'coral'},
  {id:6, name:'Yellow Beat',  bpm:125, duration:40, difficulty:'Medium', density:.72, color:'yellow'},
  {id:7, name:'Forest Run',   bpm:135, duration:42, difficulty:'Hard',   density:.78, color:'green'},
  {id:8, name:'Ocean Drive',  bpm:145, duration:45, difficulty:'Hard',   density:.82, color:'sky'},
  {id:9, name:'Master Craft', bpm:155, duration:50, difficulty:'Hard',   density:.88, color:'coral'}
];

/* ---------- Audio ---------- */
let audioCtx = null;
function ensureAudio(){
  if(!audioCtx){
    try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){}
  }
  if(audioCtx && audioCtx.state==='suspended') audioCtx.resume();
  return audioCtx;
}
function playTone(opts){
  if(!state.audioEnabled) return;
  const ctx = ensureAudio();
  if(!ctx) return;
  const {freq=440, type='sine', dur=.15, gain=.2, slideTo=null, attack=.005}=opts;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type=type;
  osc.frequency.setValueAtTime(freq, t0);
  if(slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0+dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0+attack);
  g.gain.exponentialRampToValueAtTime(.0001, t0+dur);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(t0); osc.stop(t0+dur+.02);
}
function playNoiseBurst(dur=.05, gain=.08, hp=4000){
  if(!state.audioEnabled) return;
  const ctx = ensureAudio(); if(!ctx) return;
  const buffer = ctx.createBuffer(1, ctx.sampleRate*dur, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1);
  const src = ctx.createBufferSource(); src.buffer=buffer;
  const filter = ctx.createBiquadFilter();
  filter.type='highpass'; filter.frequency.value=hp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime+dur);
  src.connect(filter); filter.connect(g); g.connect(ctx.destination);
  src.start();
}

/* ---------- Canvas / Game ---------- */
const canvas = document.getElementById('game-canvas');
const ctx2 = canvas.getContext('2d');
const W = 480, H = 680;

// roundRect polyfill
if(!CanvasRenderingContext2D.prototype.roundRect){
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
    if(typeof r==='number') r=[r,r,r,r];
    this.beginPath();
    this.moveTo(x+r[0],y);
    this.arcTo(x+w,y,x+w,y+h,r[1]);
    this.arcTo(x+w,y+h,x,y+h,r[2]);
    this.arcTo(x,y+h,x,y,r[3]);
    this.arcTo(x,y,x+w,y,r[0]);
    this.closePath();
    return this;
  };
}

const LANE_COLORS = ['#FF6B6B','#FFD23F','#4ADE80','#38BDF8'];
const LANE_KEYS = ['d','f','j','k'];
const FALL_TIME = 1700;
const PERFECT_WIN = 75;
const GOOD_WIN = 150;

let game = null;

class Game {
  constructor(level){
    this.level = level;
    this.notes = [];
    this.particles = [];
    this.popups = [];
    this.laneFlash = [0,0,0,0];
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lives = 3;
    this.hits = {perfect:0, good:0, miss:0};
    this.elapsed = 0;
    this.startTime = 0;
    this.totalPauseMs = 0;
    this.pauseStart = 0;
    this.paused = false;
    this.running = false;
    this.lastBeatIdx = -1;
    this.beatPulse = 0;
    this.endTime = (level.duration + 2) * 1000;
    this.countdownMs = 2200;
    this.countingDown = true;
    this.shake = 0;
    this.gameOver = false;
    this.generate();
  }

  generate(){
    const beatMs = 60000/this.level.bpm;
    const subMs = beatMs/2;
    const total = Math.floor(this.level.duration*1000/subMs);
    let lastLane=-1;
    for(let i=0;i<total;i++){
      const time = i*subMs + 1800;
      if(Math.random() < this.level.density){
        let lane;
        do{ lane = Math.floor(Math.random()*4); } while(lane===lastLane && Math.random()<.55);
        this.notes.push({time, lane, hit:false, missed:false});
        lastLane = lane;
        if(this.level.difficulty!=='Easy' && Math.random()<.12){
          let l2;
          do{ l2 = Math.floor(Math.random()*4); } while(l2===lane);
          this.notes.push({time, lane:l2, hit:false, missed:false});
        }
      }
    }
  }

  start(){
    ensureAudio();
    this.running = true;
    this.lastFrame = performance.now();
    requestAnimationFrame(t=>this.loop(t));
  }

  pause(){
    if(this.paused || !this.running) return;
    this.paused = true;
    this.pauseStart = performance.now();
  }
  resume(){
    if(!this.paused) return;
    this.totalPauseMs += performance.now() - this.pauseStart;
    this.paused = false;
  }

  loop(now){
    if(!this.running) return;
    const dt = now - this.lastFrame;
    this.lastFrame = now;

    if(!this.paused){
      // Countdown first
      if(this.countingDown){
        this.countdownMs -= dt;
        if(this.countdownMs <= 0){
          this.countingDown = false;
          this.startTime = now;
        }
      } else {
        this.elapsed = now - this.startTime - this.totalPauseMs;
        // Beat triggers
        const beatMs = 60000/this.level.bpm;
        const beatIdx = Math.floor(this.elapsed/beatMs);
        if(beatIdx !== this.lastBeatIdx && beatIdx >= 0){
          this.lastBeatIdx = beatIdx;
          this.beatPulse = 1;
          this.playKick(beatIdx % 4 === 0);
          if(beatIdx % 2 === 1) this.playHat();
        }
        this.beatPulse *= .9;

        // Check misses
        for(const n of this.notes){
          if(!n.hit && !n.missed && this.elapsed - n.time > GOOD_WIN){
            n.missed = true;
            this.registerMiss(n.lane);
          }
        }

        // End conditions
        if(this.elapsed >= this.endTime){
          this.finish(false);
          return;
        }

        // Update effects
        for(let i=this.particles.length-1;i>=0;i--){
          const p = this.particles[i];
          p.x+=p.vx; p.y+=p.vy; p.vy+=.35;
          p.vx*=.98;
          p.life--;
          p.rot+=p.vr;
          if(p.life<=0) this.particles.splice(i,1);
        }
        for(let i=this.popups.length-1;i>=0;i--){
          const p = this.popups[i];
          p.y -= 1.1;
          p.life--;
          if(p.life<=0) this.popups.splice(i,1);
        }
        for(let i=0;i<4;i++) this.laneFlash[i] *= .85;
        this.shake *= .82;
      }
    }

    this.render();
    this.updateHUD();
    requestAnimationFrame(t=>this.loop(t));
  }

  playKick(accent){
    if(!state.audioEnabled) return;
    playTone({freq:accent?140:100, type:'sine', dur:.16, gain:accent?.42:.28, slideTo:42, attack:.002});
  }
  playHat(){
    playNoiseBurst(.04, .05, 6000);
  }
  playHitSound(lane, perfect){
    const freqs = [330, 440, 550, 660];
    playTone({freq:freqs[lane], type:'triangle', dur:.13, gain:.22, slideTo:freqs[lane]*1.4, attack:.001});
    if(perfect) playTone({freq:freqs[lane]*2, type:'sine', dur:.18, gain:.12, attack:.001});
  }
  playMissSound(){
    playTone({freq:170, type:'sawtooth', dur:.18, gain:.14, slideTo:80, attack:.002});
  }

  handleKey(lane){
    if(!this.running || this.paused) return;
    if(this.countingDown) return;
    this.laneFlash[lane] = 1;
    let nearest=null, dist=Infinity;
    for(const n of this.notes){
      if(n.lane!==lane || n.hit || n.missed) continue;
      const d = Math.abs(n.time - this.elapsed);
      if(d < dist){ dist=d; nearest=n; }
    }
    if(nearest && dist < GOOD_WIN){
      nearest.hit = true;
      const perfect = dist < PERFECT_WIN;
      this.registerHit(lane, perfect);
    }
  }

  registerHit(lane, perfect){
    const base = perfect ? 100 : 50;
    const bonus = Math.floor(this.combo/10)*15;
    this.score += base + bonus;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if(perfect) this.hits.perfect++; else this.hits.good++;
    this.spawnParticles(lane, perfect?16:10, perfect);
    this.popups.push({
      x: lane*(W/4) + (W/8),
      y: H - 130,
      text: perfect ? 'PERFECT' : 'GOOD',
      color: perfect ? '#4ADE80' : '#FFD23F',
      life: 55
    });
    this.playHitSound(lane, perfect);
    if(navigator.vibrate) navigator.vibrate(perfect?28:14);
  }

  registerMiss(lane){
    this.combo = 0;
    this.lives--;
    this.hits.miss++;
    this.shake = 8;
    this.popups.push({
      x: lane*(W/4) + (W/8),
      y: H - 130,
      text: 'MISS',
      color: '#FF6B6B',
      life: 50
    });
    this.playMissSound();
    if(navigator.vibrate) navigator.vibrate([20,30,20]);
    if(this.lives<=0){
      this.finish(true);
    }
  }

  spawnParticles(lane, count, perfect){
    if(state.motionReduced) count = Math.min(4, count);
    const cx = lane*(W/4) + (W/8);
    const cy = H - 95;
    const baseColor = LANE_COLORS[lane];
    for(let i=0;i<count;i++){
      const ang = (Math.PI*2*i/count) + Math.random()*.4;
      const sp = 3 + Math.random()*5;
      this.particles.push({
        x:cx, y:cy,
        vx:Math.cos(ang)*sp,
        vy:Math.sin(ang)*sp - 2,
        size: 5 + Math.random()*7,
        color: Math.random()<.35 ? '#FFFFFF' : (perfect && Math.random()<.3 ? '#FFD23F' : baseColor),
        life: 28 + Math.random()*22,
        rot: Math.random()*Math.PI*2,
        vr: (Math.random()-.5)*.4
      });
    }
  }

  finish(gameOver){
    if(!this.running) return;
    this.running = false;
    this.gameOver = gameOver;
    showResults(this, gameOver);
  }

  updateHUD(){
    const score = this.score;
    const combo = this.combo;
    const total = this.hits.perfect + this.hits.good + this.hits.miss;
    const acc = total===0 ? 100 : Math.round((this.hits.perfect + this.hits.good*.5)/total*100);
    const hearts = '♥'.repeat(Math.max(0,this.lives)) + '♡'.repeat(Math.max(0,3-this.lives));
    const set = (id, v, idM, vM) => {
      const el = document.getElementById(id); if(el) el.textContent = v;
      const elm = document.getElementById(idM); if(elm) elm.textContent = vM;
    };
    set('hud-score', score, 'hud-score-m', score);
    set('hud-combo', combo+'×', 'hud-combo-m', combo+'×');
    set('hud-accuracy', acc+'%', 'hud-accuracy-m', acc+'%');
    set('hud-lives', hearts, 'hud-lives-m', hearts);
  }

  render(){
    const c = ctx2;
    c.save();
    // Shake
    if(this.shake > .3 && !state.motionReduced){
      const sx = (Math.random()-.5)*this.shake;
      const sy = (Math.random()-.5)*this.shake;
      c.translate(sx, sy);
    }

    // Background
    const p = this.beatPulse;
    const grad = c.createLinearGradient(0,0,0,H);
    grad.addColorStop(0, `rgb(${22+p*30},${27+p*20},${58+p*40})`);
    grad.addColorStop(1, `rgb(${14+p*18},${18+p*14},${38+p*25})`);
    c.fillStyle = grad;
    c.fillRect(0,0,W,H);

    // Lanes
    const laneW = W/4;
    const hitY = H - 100;
    for(let i=0;i<4;i++){
      const x = i*laneW;
      c.fillStyle = i%2===0 ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.05)';
      c.fillRect(x, 0, laneW, H);
      // Lane flash glow
      if(this.laneFlash[i] > .05){
        const lg = c.createLinearGradient(0, hitY-180, 0, hitY+50);
        lg.addColorStop(0, 'rgba(255,255,255,0)');
        lg.addColorStop(1, LANE_COLORS[i]);
        c.globalAlpha = this.laneFlash[i]*.55;
        c.fillStyle = lg;
        c.fillRect(x, hitY-180, laneW, 230);
        c.globalAlpha = 1;
      }
      if(i>0){
        c.strokeStyle = 'rgba(255,255,255,.08)';
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(x,0); c.lineTo(x,H); c.stroke();
      }
    }

    // Hit zones
    for(let i=0;i<4;i++){
      const x = i*laneW + 12;
      const w = laneW - 24;
      c.fillStyle = LANE_COLORS[i];
      c.globalAlpha = .18 + this.laneFlash[i]*.45;
      c.roundRect(x, hitY-26, w, 56, 14); c.fill();
      c.globalAlpha = 1;
      c.strokeStyle = LANE_COLORS[i];
      c.lineWidth = 3 + this.laneFlash[i]*2;
      c.roundRect(x, hitY-26, w, 56, 14); c.stroke();
    }

    // Hit line
    c.fillStyle = 'rgba(255,255,255,.9)';
    c.fillRect(0, hitY-2, W, 4);

    // Notes
    for(const n of this.notes){
      if(n.hit) continue;
      const dt = n.time - this.elapsed;
      if(dt > FALL_TIME) continue;
      if(n.missed && dt < -GOOD_WIN-200) continue;
      const progress = 1 - (dt / FALL_TIME);
      const y = progress * hitY;
      if(y < -40) continue;
      const x = n.lane*laneW + 14;
      const nw = laneW - 28;
      const nh = 34;
      // Shadow
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.roundRect(x+3, y+4, nw, nh, 12); c.fill();
      // Body
      c.fillStyle = n.missed ? '#3a3f5c' : LANE_COLORS[n.lane];
      c.roundRect(x, y, nw, nh, 12); c.fill();
      // Highlight stripe
      c.fillStyle = 'rgba(255,255,255,.45)';
      c.roundRect(x+5, y+5, nw-10, 7, 4); c.fill();
      // Border
      c.strokeStyle = '#0E1330';
      c.lineWidth = 3;
      c.roundRect(x, y, nw, nh, 12); c.stroke();
      // Inner shine dot
      c.fillStyle = 'rgba(255,255,255,.55)';
      c.beginPath(); c.arc(x+nw-12, y+nh/2, 3, 0, Math.PI*2); c.fill();
    }

    // Particles
    for(const p of this.particles){
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.globalAlpha = Math.min(1, p.life/30);
      c.fillStyle = p.color;
      c.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      c.strokeStyle = '#0E1330';
      c.lineWidth = 2;
      c.strokeRect(-p.size/2, -p.size/2, p.size, p.size);
      c.restore();
    }
    c.globalAlpha = 1;

    // Popups
    for(const p of this.popups){
      c.save();
      c.globalAlpha = Math.min(1, p.life/30);
      c.font = 'bold 26px Fredoka, sans-serif';
      c.textAlign = 'center';
      c.lineWidth = 5;
      c.strokeStyle = '#0E1330';
      c.strokeText(p.text, p.x, p.y);
      c.fillStyle = p.color;
      c.fillText(p.text, p.x, p.y);
      c.restore();
    }
    c.globalAlpha = 1;

    // Combo (center-top)
    if(this.combo >= 4){
      c.save();
      const sc = 1 + Math.min(.3, this.combo*.01);
      c.translate(W/2, 70);
      c.scale(sc, sc);
      c.font = 'bold 36px Fredoka, sans-serif';
      c.textAlign = 'center';
      c.lineWidth = 6;
      c.strokeStyle = '#0E1330';
      const grad2 = c.createLinearGradient(0,-20,0,20);
      grad2.addColorStop(0,'#FFD23F');
      grad2.addColorStop(1,'#FF6B6B');
      c.strokeText(this.combo + ' COMBO', 0, 0);
      c.fillStyle = grad2;
      c.fillText(this.combo + ' COMBO', 0, 0);
      c.restore();
    }

    // Lane key labels
    c.font = 'bold 18px Fredoka, sans-serif';
    c.textAlign = 'center';
    for(let i=0;i<4;i++){
      const x = i*laneW + laneW/2;
      c.fillStyle = 'rgba(255,255,255,.65)';
      c.fillText(['D','F','J','K'][i], x, H-18);
    }

    // Progress bar
    const prog = Math.min(1, Math.max(0, this.elapsed/this.endTime));
    c.fillStyle = 'rgba(255,255,255,.15)';
    c.fillRect(16, 16, W-32, 8);
    c.fillStyle = '#4ADE80';
    c.roundRect(16, 16, (W-32)*prog, 8, 4); c.fill();

    // Countdown
    if(this.countingDown){
      c.fillStyle = 'rgba(14,19,48,.6)';
      c.fillRect(0,0,W,H);
      const num = Math.ceil(this.countdownMs/700);
      const label = num > 0 ? String(num) : 'GO!';
      c.save();
      c.translate(W/2, H/2);
      const phase = (this.countdownMs % 700) / 700;
      const sc = 1 + (1-phase)*.5;
      c.scale(sc, sc);
      c.globalAlpha = phase*.9 + .1;
      c.font = 'bold 120px Fredoka, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 8;
      c.strokeStyle = '#0E1330';
      c.strokeText(label, 0, 0);
      c.fillStyle = label==='GO!' ? '#4ADE80' : '#FFD23F';
      c.fillText(label, 0, 0);
      c.restore();
      c.globalAlpha = 1;
      c.textBaseline = 'alphabetic';
      c.font = 'bold 18px Fredoka, sans-serif';
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.fillText('Get ready', W/2, H/2 + 90);
    }

    // Paused overlay
    if(this.paused){
      c.fillStyle = 'rgba(14,19,48,.75)';
      c.fillRect(0,0,W,H);
      c.fillStyle = '#fff';
      c.font = 'bold 56px Fredoka, sans-serif';
      c.textAlign = 'center';
      c.fillText('PAUSED', W/2, H/2);
      c.font = '600 18px Plus Jakarta Sans, sans-serif';
      c.fillStyle = 'rgba(255,255,255,.75)';
      c.fillText('Press Space or tap pause to resume', W/2, H/2 + 36);
    }

    c.restore();
  }
}

/* ---------- Navigation ---------- */
function showScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el = document.getElementById('screen-'+name);
  if(el) el.classList.add('active');
  state.screen = name;
  const hud = document.getElementById('hud-top');
  if(name==='game'){
    hud.classList.remove('hidden');
    hud.classList.add('grid');
  } else {
    hud.classList.add('hidden');
    hud.classList.remove('grid');
  }
}

function showStart(){ showScreen('start'); }
function showLevels(){
  renderLevels();
  showScreen('levels');
}
function quickStart(){ startLevel(1); }

const colorBgMap = {
  coral:'var(--coral)',
  yellow:'var(--yellow)',
  green:'var(--green)',
  sky:'var(--sky)'
};
const colorTextMap = {
  coral:'#fff',
  yellow:'var(--navy)',
  green:'var(--navy)',
  sky:'var(--navy)'
};

function renderLevels(){
  const grid = document.getElementById('level-grid');
  grid.innerHTML = '';
  levels.forEach(level=>{
    const unlocked = state.unlockedLevels.includes(level.id);
    const card = document.createElement('button');
    card.className = 'level-card' + (unlocked ? '' : ' locked');
    card.style.background = unlocked ? colorBgMap[level.color] : '#E5E7EC';
    card.style.color = unlocked ? colorTextMap[level.color] : '#9CA3AF';
    if(!unlocked) card.setAttribute('disabled', 'true');
    const hs = state.highScores[level.id] || 0;
    const stars = hs>5000?3 : hs>2000?2 : hs>0?1 : 0;
    card.innerHTML = `
      <div class="pattern"></div>
      <div class="relative">
        <div class="flex items-start justify-between mb-3">
          <div class="font-display font-bold text-3xl leading-none">#${level.id}</div>
          ${unlocked
            ? `<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md" style="background:rgba(0,0,0,.15)">${level.difficulty}</span>`
            : `<svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1a5 5 0 00-5 5v3H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2v-9a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm0 2a3 3 0 013 3v3H9V6a3 3 0 013-3z"/></svg>`}
        </div>
        <div class="font-display font-bold text-xl mb-1">${level.name}</div>
        <div class="text-xs font-semibold opacity-80 mb-3">${level.bpm} BPM · ${level.duration}s</div>
        ${unlocked ? `
          <div class="flex gap-1 items-center">
            ${[1,2,3].map(i=>`
              <svg width="20" height="20" fill="${i<=stars?'currentColor':'none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="opacity:${i<=stars?'1':'.4'}">
                <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" stroke-linejoin="round"/>
              </svg>
            `).join('')}
            ${hs>0?`<span class="text-xs font-bold ml-2 opacity-80">${hs}</span>`:''}
          </div>
        ` : `
          <div class="text-xs font-bold opacity-70">Clear previous level to unlock</div>
        `}
      </div>
    `;
    if(unlocked){
      card.addEventListener('click', ()=>startLevel(level.id));
    } else {
      card.addEventListener('click', ()=>showToast('Locked — clear the previous level first'));
    }
    grid.appendChild(card);
  });
}

function startLevel(id){
  ensureAudio();
  const level = levels.find(l=>l.id===id);
  if(!level) return;
  state.currentLevelId = id;
  showScreen('game');
  if(game) game.running = false;
  game = new Game(level);
  game.start();
}

function quitGame(){
  if(game) game.running = false;
  game = null;
  showLevels();
  showToast('Level quit');
}

function togglePause(){
  if(!game || !game.running) return;
  if(game.paused){ game.resume(); showToast('Resumed'); }
  else { game.pause(); showToast('Paused'); }
}

function replayLevel(){ startLevel(state.currentLevelId); }
function nextLevel(){
  const n = state.currentLevelId + 1;
  if(n <= levels.length) startLevel(n);
  else { showToast('You cleared every level — master!'); showLevels(); }
}

function showResults(g, gameOver){
  const total = g.hits.perfect + g.hits.good + g.hits.miss;
  const acc = total===0 ? 0 : Math.round((g.hits.perfect + g.hits.good*.5)/total*100);

  document.getElementById('result-perfect').textContent = g.hits.perfect;
  document.getElementById('result-good').textContent = g.hits.good;
  document.getElementById('result-miss').textContent = g.hits.miss;
  document.getElementById('result-score').textContent = g.score;
  document.getElementById('result-combo').textContent = g.maxCombo + '×';
  document.getElementById('result-acc').textContent = acc + '%';

  const title = document.getElementById('results-title');
  const sub = document.getElementById('results-subtitle');
  if(gameOver){
    title.textContent = 'Out of lives';
    title.style.color = 'var(--coral)';
    sub.textContent = 'The run ended early — give it another shot.';
  } else if(acc >= 92){
    title.textContent = 'Flawless!';
    title.style.color = 'var(--green)';
    sub.textContent = 'Masterful timing. Encore?';
  } else if(acc >= 75){
    title.textContent = 'Level Complete!';
    title.style.color = 'var(--navy)';
    sub.textContent = 'Solid run. Try again for a higher score.';
  } else {
    title.textContent = 'Complete!';
    title.style.color = 'var(--navy)';
    sub.textContent = 'Good effort — practice makes perfect.';
  }

  // Stars
  let stars = 0;
  if(!gameOver){
    if(g.score > 1200) stars = 1;
    if(g.score > 3500) stars = 2;
    if(g.score > 6500 && acc > 85) stars = 3;
  }
  const starsBox = document.getElementById('result-stars');
  starsBox.innerHTML = '';
  for(let i=1;i<=3;i++){
    const lit = i <= stars;
    const s = document.createElement('div');
    s.className = 'result-star' + (lit?' lit':'');
    s.style.color = lit ? 'var(--yellow)' : '#D1D5DB';
    s.innerHTML = `<svg viewBox="0 0 24 24" width="54" height="54" fill="${lit?'currentColor':'none'}" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    starsBox.appendChild(s);
  }

  // Save progress
  if(!gameOver){
    const id = state.currentLevelId;
    if(!state.highScores[id] || g.score > state.highScores[id]){
      state.highScores[id] = g.score;
    }
    const next = id + 1;
    if(next <= levels.length && !state.unlockedLevels.includes(next)){
      state.unlockedLevels.push(next);
      setTimeout(()=>showToast('Next level unlocked!'), 600);
    }
  }

  // Next button
  const nb = document.getElementById('next-level-btn');
  if(gameOver || state.currentLevelId >= levels.length){
    nb.style.display = 'none';
  } else {
    nb.style.display = '';
  }

  showScreen('results');
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 1800);
}

/* ---------- Input ---------- */
document.addEventListener('keydown', (e)=>{
  if(e.repeat) return;
  if(state.screen==='game' && game){
    const k = e.key.toLowerCase();
    const lane = LANE_KEYS.indexOf(k);
    if(lane>=0){
      e.preventDefault();
      game.handleKey(lane);
      return;
    }
    if(e.key === ' '){ e.preventDefault(); togglePause(); return; }
    if(e.key === 'Escape'){ quitGame(); return; }
  }
  if(state.screen !== 'game'){
    if(e.key === 'Enter' && state.screen==='start'){ showLevels(); }
  }
});

canvas.addEventListener('pointerdown', (e)=>{
  if(!game || !game.running || game.paused || game.countingDown) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * W;
  const lane = Math.max(0, Math.min(3, Math.floor(x/(W/4))));
  game.handleKey(lane);
});

document.querySelectorAll('.lane-btn').forEach(btn=>{
  btn.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    if(!game || !game.running) return;
    const lane = parseInt(btn.dataset.lane);
    game.handleKey(lane);
  });
});

/* ---------- Toggles ---------- */
document.getElementById('audio-toggle').addEventListener('click', ()=>{
  state.audioEnabled = !state.audioEnabled;
  const btn = document.getElementById('audio-toggle');
  btn.classList.toggle('toggled-off', !state.audioEnabled);
  showToast(state.audioEnabled ? 'Sound on' : 'Sound off');
  if(state.audioEnabled) ensureAudio();
});

document.getElementById('motion-toggle').addEventListener('click', ()=>{
  state.motionReduced = !state.motionReduced;
  document.body.classList.toggle('reduced-motion', state.motionReduced);
  const btn = document.getElementById('motion-toggle');
  btn.classList.toggle('toggled-off', state.motionReduced);
  showToast(state.motionReduced ? 'Reduced motion on' : 'Reduced motion off');
});

/* ---------- Init ---------- */
renderLevels();
