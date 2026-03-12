import React, { useEffect, useRef, useState, useCallback } from 'react';
import { TABLE_WIDTH, TABLE_HEIGHT, BALL_RADIUS, COLORS, POCKET_RADIUS } from '../constants';
import { Ball, Vector, distance, normalize } from '../types';
import { updatePhysics, getTrajectory } from '../physics';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCcw, Play, Timer, Trophy } from 'lucide-react';

const PoolGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [balls, setBalls] = useState<Ball[]>([]);
  const cueBall = balls.find(b => b.isCue);
  const [isAiming, setIsAiming] = useState(false);
  const [mousePos, setMousePos] = useState<Vector>({ x: 0, y: 0 });
  const [power, setPower] = useState(0);
  const [isCharging, setIsCharging] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover'>('start');
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
  const [hasShot, setHasShot] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);

  const requestRef = useRef<number>();

  // Audio Synthesis for Pocket
  const playPocketSound = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.2);

      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
      console.warn('Audio context failed', e);
    }
  }, []);

  // Realistic Collision Sound
  const playCollisionSound = useCallback((type: 'wall' | 'ball', velocity: number) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      const volume = Math.min(velocity / 12, 0.4);
      
      if (type === 'ball') {
        // High frequency "clack"
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.03);
        
        filter.type = 'highpass';
        filter.frequency.value = 800;
        
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.04);
      } else {
        // Thud for wall
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(200, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.08);
        
        filter.type = 'lowpass';
        filter.frequency.value = 600;
        
        gainNode.gain.setValueAtTime(volume * 0.8, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      }

      oscillator.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.warn('Audio context failed', e);
    }
  }, []);

  // Stick Hit Sound
  const playStickHitSound = useCallback((strength: number) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.05);

      gainNode.gain.setValueAtTime(Math.min(strength / 50, 0.4), audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.05);
    } catch (e) {
      console.warn('Audio context failed', e);
    }
  }, []);

  // Handle Orientation
  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const initGame = useCallback(() => {
    const initialBalls: Ball[] = [];
    
    // Cue Ball
    const cb: Ball = {
      id: 0,
      pos: { x: TABLE_WIDTH / 4, y: TABLE_HEIGHT / 2 },
      vel: { x: 0, y: 0 },
      color: COLORS.CUE_BALL,
      isCue: true,
      inPocket: false
    };
    initialBalls.push(cb);

    // Rack of balls
    const startX = (TABLE_WIDTH * 3) / 4;
    const startY = TABLE_HEIGHT / 2;
    let ballId = 1;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        initialBalls.push({
          id: ballId,
          pos: {
            x: startX + row * (BALL_RADIUS * 1.8),
            y: startY - (row * BALL_RADIUS) + (col * BALL_RADIUS * 2.1)
          },
          vel: { x: 0, y: 0 },
          color: COLORS.BALLS[(ballId - 1) % COLORS.BALLS.length],
          inPocket: false,
          isStriped: ballId > 8
        });
        ballId++;
      }
    }

    setBalls(initialBalls);
    setScore(0);
    setTimeLeft(60);
    setHasShot(false);
    setGameState('playing');
    // Initialize mousePos to point away from the rack
    setMousePos({ x: TABLE_WIDTH / 4 - 100, y: TABLE_HEIGHT / 2 });
  }, []);

  const animate = useCallback(() => {
    setBalls(prevBalls => {
      const newBalls = [...prevBalls].map(b => ({ ...b, pos: { ...b.pos }, vel: { ...b.vel } }));
      const collisions = updatePhysics(newBalls);
      
      // Play collision sounds
      collisions.forEach(c => playCollisionSound(c.type, c.velocity));

      // Check for potted balls
      const pottedBalls = newBalls.filter(b => b.inPocket && !prevBalls.find(pb => pb.id === b.id)?.inPocket);
      if (pottedBalls.length > 0) {
        playPocketSound();
        const cuePotted = pottedBalls.find(b => b.isCue);
        if (cuePotted) {
          cuePotted.inPocket = false;
          cuePotted.pos = { x: TABLE_WIDTH / 4, y: TABLE_HEIGHT / 2 };
          cuePotted.vel = { x: 0, y: 0 };
        } else {
          setScore(s => s + pottedBalls.length * 100);
        }
      }

      return newBalls;
    });

    requestRef.current = requestAnimationFrame(animate);
  }, [gameState, playPocketSound, playCollisionSound]);

  useEffect(() => {
    if (gameState === 'playing') {
      requestRef.current = requestAnimationFrame(animate);
      const timer = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            setGameState('gameover');
            return 0;
          }
          return t - 1;
        });
      }, 1000);
      return () => {
        cancelAnimationFrame(requestRef.current!);
        clearInterval(timer);
      };
    }
  }, [gameState, animate]);

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas || !cueBall) return;

    // Check if any balls are moving
    const allMoving = balls.some(b => Math.abs(b.vel.x) > 0.15 || Math.abs(b.vel.y) > 0.15);
    if (allMoving) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    // Scale coordinates with a bit of padding for edge hits
    const x = (clientX - rect.left) * (TABLE_WIDTH / rect.width);
    const y = (clientY - rect.top) * (TABLE_HEIGHT / rect.height);

    // Increase hit area significantly for starting a shot, especially near edges
    const dist = distance({ x, y }, cueBall.pos);
    if (dist < BALL_RADIUS * 15) {
      setIsCharging(true);
      setPower(0);
      setMousePos({ x, y });
    }
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!isCharging || !cueBall || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const x = (clientX - rect.left) * (TABLE_WIDTH / rect.width);
      const y = (clientY - rect.top) * (TABLE_HEIGHT / rect.height);
      
      setMousePos({ x, y });

      const dist = distance({ x, y }, cueBall.pos);
      // Power is based on distance from cue ball
      const p = Math.min(Math.max((dist - BALL_RADIUS) / 150, 0), 1);
      setPower(p);
    };

    const handleGlobalMouseUp = () => {
      if (isCharging && cueBall) {
        // Only shoot if there's significant power to avoid accidental clicks
        if (power > 0.05) {
          const dir = normalize({
            x: cueBall.pos.x - mousePos.x,
            y: cueBall.pos.y - mousePos.y
          });

          const strength = power * 30; // Increased max strength slightly
          
          playStickHitSound(strength);

          setBalls(prev => prev.map(b => 
            b.isCue ? { ...b, vel: { x: dir.x * strength, y: dir.y * strength } } : b
          ));
          setHasShot(true);
        }

        setIsCharging(false);
        setPower(0);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchmove', handleGlobalMouseMove, { passive: false });
    window.addEventListener('touchend', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalMouseMove);
      window.removeEventListener('touchend', handleGlobalMouseUp);
    };
  }, [isCharging, balls, mousePos, power]);

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (isCharging) return; // Handled by global listener
    
    const canvas = canvasRef.current;
    if (!canvas || !cueBall) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) * (TABLE_WIDTH / rect.width);
    const y = (clientY - rect.top) * (TABLE_HEIGHT / rect.height);
    setMousePos({ x, y });
  };

  // Draw Function
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    // Table Bed
    ctx.fillStyle = COLORS.TABLE_BED;
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    // Table Texture (Subtle Gradient)
    const grad = ctx.createRadialGradient(TABLE_WIDTH/2, TABLE_HEIGHT/2, 50, TABLE_WIDTH/2, TABLE_HEIGHT/2, TABLE_WIDTH/1.5);
    grad.addColorStop(0, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    // Pockets
    const pockets = [
      { x: 0, y: 0 }, { x: TABLE_WIDTH / 2, y: 0 }, { x: TABLE_WIDTH, y: 0 },
      { x: 0, y: TABLE_HEIGHT }, { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT }, { x: TABLE_WIDTH, y: TABLE_HEIGHT }
    ];
    pockets.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.POCKET;
      ctx.fill();
      // Pocket shadow
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Balls
    balls.forEach(ball => {
      if (ball.inPocket) return;

      // Ball Shadow
      ctx.beginPath();
      ctx.ellipse(ball.pos.x + 2, ball.pos.y + 2, BALL_RADIUS, BALL_RADIUS * 0.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fill();

      // Ball Body
      ctx.beginPath();
      ctx.arc(ball.pos.x, ball.pos.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = ball.color;
      ctx.fill();

      // Ball Shine
      const shine = ctx.createRadialGradient(
        ball.pos.x - BALL_RADIUS * 0.3,
        ball.pos.y - BALL_RADIUS * 0.3,
        BALL_RADIUS * 0.1,
        ball.pos.x,
        ball.pos.y,
        BALL_RADIUS
      );
      shine.addColorStop(0, 'rgba(255,255,255,0.4)');
      shine.addColorStop(1, 'rgba(0,0,0,0.1)');
      ctx.fillStyle = shine;
      ctx.fill();

      // Stripe or Number
      if (ball.id > 0) {
        ctx.fillStyle = 'white';
        if (ball.isStriped) {
          // Simplified stripe
          ctx.save();
          ctx.beginPath();
          ctx.arc(ball.pos.x, ball.pos.y, BALL_RADIUS, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillRect(ball.pos.x - BALL_RADIUS, ball.pos.y - BALL_RADIUS/2, BALL_RADIUS * 2, BALL_RADIUS);
          ctx.restore();
        }
        // Number circle
        ctx.beginPath();
        ctx.arc(ball.pos.x, ball.pos.y, BALL_RADIUS * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ball.id.toString(), ball.pos.x, ball.pos.y);
      }
    });

    // Cue Stick and Trajectory
    const currentCueBall = balls.find(b => b.isCue && !b.inPocket);
    const allMoving = balls.some(b => Math.abs(b.vel.x) > 0.1 || Math.abs(b.vel.y) > 0.1);

    if (currentCueBall && !allMoving && gameState === 'playing') {
      const dx = currentCueBall.pos.x - mousePos.x;
      const dy = currentCueBall.pos.y - mousePos.y;
      
      // Prevent stick flickering when mouse is exactly on ball
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        const dir = normalize({ x: dx, y: dy });

        // Trajectory
        const trajectory = getTrajectory(currentCueBall.pos, dir, balls);
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.moveTo(trajectory[0].x, trajectory[0].y);
        for (let i = 1; i < trajectory.length; i++) {
          ctx.lineTo(trajectory[i].x, trajectory[i].y);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);

        // Cue Stick
        const stickLength = 300;
        const stickOffset = BALL_RADIUS + 5 + (isCharging ? power * 60 : 0);
        const stickStart = {
          x: currentCueBall.pos.x - dir.x * stickOffset,
          y: currentCueBall.pos.y - dir.y * stickOffset
        };
        const stickEnd = {
          x: stickStart.x - dir.x * stickLength,
          y: stickStart.y - dir.y * stickLength
        };

        // Stick Shadow
        ctx.beginPath();
        ctx.moveTo(stickStart.x + 4, stickStart.y + 4);
        ctx.lineTo(stickEnd.x + 4, stickEnd.y + 4);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 4;
        ctx.stroke();

        const stickGrad = ctx.createLinearGradient(stickStart.x, stickStart.y, stickEnd.x, stickEnd.y);
        stickGrad.addColorStop(0, '#f5deb3'); // Wheat
        stickGrad.addColorStop(0.8, '#8b4513'); // SaddleBrown
        stickGrad.addColorStop(1, '#222');

        ctx.beginPath();
        ctx.moveTo(stickStart.x, stickStart.y);
        ctx.lineTo(stickEnd.x, stickEnd.y);
        ctx.strokeStyle = stickGrad;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.stroke();
        
        // Tip
        ctx.beginPath();
        ctx.moveTo(stickStart.x, stickStart.y);
        ctx.lineTo(stickStart.x - dir.x * 6, stickStart.y - dir.y * 6);
        ctx.strokeStyle = '#add8e6'; // LightBlue tip
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }

  }, [balls, mousePos, isCharging, power, gameState]);

  if (gameState === 'playing' && !isLandscape) {
    return (
      <div className="fixed inset-0 bg-zinc-950 flex flex-col items-center justify-center text-white p-8 text-center z-50">
        <motion.div
          animate={{ rotate: 90 }}
          transition={{ duration: 2, repeat: Infinity }}
          className="mb-6"
        >
          <RotateCcw size={64} className="text-blue-500" />
        </motion.div>
        <h2 className="text-2xl font-bold mb-2">Please Rotate Your Device</h2>
        <p className="text-zinc-400">This game is best played in landscape mode.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-zinc-900 flex items-center justify-center overflow-hidden font-sans select-none touch-none">
      {/* Background Texture */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)', backgroundSize: '24px 24px' }} />

      {/* Game UI Header - Stylized & Central */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-4 z-10">
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-2 flex items-center gap-3 shadow-2xl">
          <Trophy size={16} className="text-blue-400" />
          <div className="text-lg font-mono font-black text-white">{score.toLocaleString()}</div>
        </div>
        
        <div className={`bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-2 flex items-center gap-3 shadow-2xl transition-colors ${timeLeft < 10 ? 'border-red-500/50' : ''}`}>
          <Timer size={16} className={timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-zinc-400'} />
          <div className={`text-lg font-mono font-black ${timeLeft < 10 ? 'text-red-400' : 'text-white'}`}>{timeLeft}s</div>
        </div>
      </div>

      {/* Table Container */}
      <div className="relative p-4 bg-[#4a2c2c] rounded-[40px] shadow-2xl border-[12px] border-[#3a1c1c]">
        {/* Rail Bolts */}
        {[0, 25, 50, 75, 100].map(x => (
          <React.Fragment key={x}>
            <div className="absolute top-[-6px] w-2 h-2 bg-zinc-400 rounded-full shadow-inner" style={{ left: `${x}%` }} />
            <div className="absolute bottom-[-6px] w-2 h-2 bg-zinc-400 rounded-full shadow-inner" style={{ left: `${x}%` }} />
          </React.Fragment>
        ))}

        <canvas
          ref={canvasRef}
          width={TABLE_WIDTH}
          height={TABLE_HEIGHT}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          className="rounded-lg cursor-crosshair shadow-inner"
          style={{ width: '85vw', height: 'auto', maxWidth: '1000px' }}
        />
      </div>

      {/* Power Meter */}
      <AnimatePresence>
        {isCharging && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4"
          >
            <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold rotate-90 mb-8">Power</div>
            <div className="w-6 h-64 bg-black/40 border border-white/10 rounded-full p-1 relative overflow-hidden">
              <motion.div 
                className="absolute bottom-1 left-1 right-1 rounded-full bg-gradient-to-t from-blue-600 via-blue-400 to-white"
                style={{ height: `${power * 100}%` }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay Screens */}
      <AnimatePresence>
        {gameState === 'start' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#ff8c00] z-50 flex flex-col items-center justify-center overflow-hidden"
            style={{
              background: 'radial-gradient(circle at center, #ffcc00 0%, #ff6600 100%)'
            }}
          >
            {/* Sunburst Effect */}
            <div className="absolute inset-0 opacity-20" style={{
              backgroundImage: 'repeating-conic-gradient(from 0deg, transparent 0deg 10deg, #fff 10deg 20deg)',
              maskImage: 'radial-gradient(circle, black, transparent 70%)'
            }} />

            {/* Silhouettes */}
            <div className="absolute bottom-0 left-0 w-full h-1/2 flex justify-between items-end px-12 opacity-30 pointer-events-none">
              <div className="w-48 h-96 bg-black rounded-t-full transform -translate-x-12" />
              <div className="w-48 h-80 bg-black rounded-t-full transform translate-x-12" />
            </div>

            {/* Pool Table Foreground */}
            <div className="absolute bottom-[-10%] left-[-10%] w-[120%] h-1/3 bg-[#1a75ff] border-t-[20px] border-[#8b0000] shadow-2xl transform perspective-1000 rotateX-20" />

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative z-10 flex flex-col items-center w-full max-w-2xl"
            >
              {/* Logo Section */}
              <div className="relative mb-8 scale-75 md:scale-90">
                <motion.div
                  animate={{ 
                    scale: [1, 1.02, 1],
                    rotate: [-0.5, 0.5, -0.5]
                  }}
                  transition={{ duration: 5, repeat: Infinity }}
                  className="relative"
                >
                  {/* Flames */}
                  <div className="absolute -top-12 -left-12 -right-12 -bottom-6 bg-gradient-to-t from-orange-500 via-yellow-400 to-transparent blur-xl opacity-50 animate-pulse" />
                  
                  <div className="relative flex items-center gap-3 bg-black/10 backdrop-blur-sm p-6 rounded-[32px] border-2 border-white/20">
                    <div className="w-20 h-20 bg-zinc-900 rounded-full border-4 border-white flex items-center justify-center shadow-xl">
                      <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                        <span className="text-2xl font-black text-black">8</span>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <h1 className="text-6xl font-black text-white tracking-tighter leading-none italic">
                        POOL
                      </h1>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="h-0.5 w-8 bg-white/40" />
                        <span className="text-white/60 font-mono text-[10px] uppercase tracking-[0.4em] font-bold">Blitz Edition</span>
                        <div className="h-0.5 w-8 bg-white/40" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>

              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto px-8"
              >
                <button 
                  onClick={initGame}
                  className="group relative px-10 py-5 bg-[#ffcc00] text-black font-black text-xl rounded-2xl hover:bg-white transition-all duration-300 shadow-xl flex items-center justify-center gap-3 overflow-hidden"
                >
                  <span className="relative z-10">PLAY NOW</span>
                  <Play size={20} className="relative z-10 fill-current" />
                  <div className="absolute inset-0 bg-white translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                </button>
                <button 
                  onClick={() => setShowHowTo(true)}
                  className="px-10 py-5 bg-black/30 backdrop-blur-md border-2 border-white/20 text-white font-black text-xl rounded-2xl hover:bg-white/10 transition-all duration-300 flex items-center justify-center"
                >
                  HOW TO PLAY
                </button>
              </motion.div>

              <div className="mt-10 flex gap-8">
                {[
                  { label: 'Time', value: '60s' },
                  { label: 'Mode', value: 'Blitz' },
                  { label: 'Reward', value: '100pts' }
                ].map(stat => (
                  <div key={stat.label} className="flex flex-col items-center">
                    <div className="text-white/40 text-[8px] uppercase tracking-widest mb-1 font-bold">{stat.label}</div>
                    <div className="text-white font-mono text-lg font-black">{stat.value}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            {showHowTo && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-8 z-[60]"
              >
                <div className="max-w-md w-full bg-[#111] border-4 border-[#ffcc00]/20 rounded-[40px] p-10 shadow-2xl">
                  <h3 className="text-4xl font-black text-[#ffcc00] mb-8 tracking-tight italic">BLITZ RULES</h3>
                  <div className="space-y-6 mb-10">
                    {[
                      { id: '01', text: 'Drag from the cue ball to aim your shot.' },
                      { id: '02', text: 'Pull back further to increase shot power.' },
                      { id: '03', text: 'Release to strike the ball.' },
                      { id: '04', text: 'Pot balls to earn 100 points each!' }
                    ].map(item => (
                      <div key={item.id} className="flex gap-6 items-start">
                        <span className="text-[#ffcc00] font-mono font-bold text-lg tracking-tighter">{item.id}</span>
                        <p className="text-zinc-300 font-medium leading-snug">{item.text}</p>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => setShowHowTo(false)}
                    className="w-full py-6 bg-[#ffcc00] text-black font-black text-xl rounded-2xl hover:bg-white transition-all shadow-xl shadow-[#ffcc00]/20"
                  >
                    GOT IT
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {gameState === 'gameover' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center p-8 text-center"
            style={{
              background: 'radial-gradient(circle at center, #ffcc00 0%, #ff6600 100%)'
            }}
          >
            {/* Sunburst Effect */}
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: 'repeating-conic-gradient(from 0deg, transparent 0deg 10deg, #fff 10deg 20deg)',
              maskImage: 'radial-gradient(circle, black, transparent 70%)'
            }} />

            {isLandscape ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-6 relative z-10"
              >
                <div className="w-20 h-20 rounded-full bg-black/20 flex items-center justify-center border border-white/40">
                  <RotateCcw size={40} className="text-white animate-spin-slow" />
                </div>
                <h2 className="text-3xl font-black text-white tracking-tight">ROTATE TO VIEW SCORE</h2>
                <p className="text-white/80 max-w-xs">Please turn your device to portrait mode to see your results and play again.</p>
              </motion.div>
            ) : (
              <motion.div
                initial={{ scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="max-w-md w-full relative z-10"
              >
                <div className="text-black/40 uppercase tracking-[0.3em] font-bold mb-2">Time's Up</div>
                <h2 className="text-7xl font-black text-white mb-8 tracking-tighter italic">GAME OVER</h2>
                
                <div className="bg-black/10 backdrop-blur-md border-4 border-white/20 rounded-[40px] p-10 mb-10">
                  <div className="text-white/60 text-sm font-bold uppercase tracking-widest mb-2">Total Score</div>
                  <div className="text-7xl font-mono font-black text-white drop-shadow-lg">{score.toLocaleString()}</div>
                </div>

                <div className="flex flex-col gap-4">
                  <button 
                    onClick={initGame}
                    className="px-12 py-6 bg-white text-black font-black text-xl rounded-3xl hover:scale-105 active:scale-95 transition-all shadow-2xl"
                  >
                    PLAY AGAIN
                  </button>
                  <button 
                    onClick={() => setGameState('start')}
                    className="px-12 py-5 bg-black/20 text-white font-black text-xl rounded-3xl hover:bg-black/30 transition-all border-2 border-white/20"
                  >
                    MAIN MENU
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instructions Overlay (Conditional) */}
      <AnimatePresence>
        {!hasShot && gameState === 'playing' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[10px] text-zinc-400 uppercase tracking-widest font-bold bg-black/40 backdrop-blur-xl px-6 py-3 rounded-full border border-white/10 shadow-2xl"
          >
            Drag from cue ball to aim & power • Release to shoot
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PoolGame;
