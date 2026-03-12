import { BALL_RADIUS, TABLE_WIDTH, TABLE_HEIGHT, FRICTION, BALL_BOUNCE, WALL_BOUNCE, MIN_VELOCITY, POCKET_RADIUS } from './constants';
import { Ball, distance, dot, Vector } from './types';

export function updatePhysics(balls: Ball[]) {
  const activeBalls = balls.filter(b => !b.inPocket);
  const allCollisions: { type: 'wall' | 'ball'; velocity: number }[] = [];
  
  const SUB_STEPS = 4;
  
  for (let step = 0; step < SUB_STEPS; step++) {
    // 1. Move balls and handle wall collisions
    activeBalls.forEach(ball => {
      ball.pos.x += ball.vel.x / SUB_STEPS;
      ball.pos.y += ball.vel.y / SUB_STEPS;

      // Friction (apply once per frame, not per sub-step, or scale it)
      if (step === 0) {
        ball.vel.x *= FRICTION;
        ball.vel.y *= FRICTION;

        if (Math.abs(ball.vel.x) < MIN_VELOCITY) ball.vel.x = 0;
        if (Math.abs(ball.vel.y) < MIN_VELOCITY) ball.vel.y = 0;
      }

      // Wall collisions
      const speed = Math.sqrt(ball.vel.x ** 2 + ball.vel.y ** 2);
      if (ball.pos.x < BALL_RADIUS) {
        ball.pos.x = BALL_RADIUS;
        ball.vel.x *= -WALL_BOUNCE;
        if (speed > 0.5) allCollisions.push({ type: 'wall', velocity: speed });
      } else if (ball.pos.x > TABLE_WIDTH - BALL_RADIUS) {
        ball.pos.x = TABLE_WIDTH - BALL_RADIUS;
        ball.vel.x *= -WALL_BOUNCE;
        if (speed > 0.5) allCollisions.push({ type: 'wall', velocity: speed });
      }

      if (ball.pos.y < BALL_RADIUS) {
        ball.pos.y = BALL_RADIUS;
        ball.vel.y *= -WALL_BOUNCE;
        if (speed > 0.5) allCollisions.push({ type: 'wall', velocity: speed });
      } else if (ball.pos.y > TABLE_HEIGHT - BALL_RADIUS) {
        ball.pos.y = TABLE_HEIGHT - BALL_RADIUS;
        ball.vel.y *= -WALL_BOUNCE;
        if (speed > 0.5) allCollisions.push({ type: 'wall', velocity: speed });
      }
    });

    // 2. Ball-to-ball collisions
    for (let i = 0; i < activeBalls.length; i++) {
      for (let j = i + 1; j < activeBalls.length; j++) {
        const b1 = activeBalls[i];
        const b2 = activeBalls[j];

        const dist = distance(b1.pos, b2.pos);
        if (dist < BALL_RADIUS * 2) {
          const normal = {
            x: (b2.pos.x - b1.pos.x) / dist,
            y: (b2.pos.y - b1.pos.y) / dist
          };

          const relativeVelocity = {
            x: b1.vel.x - b2.vel.x,
            y: b1.vel.y - b2.vel.y
          };

          const speed = dot(relativeVelocity, normal);

          if (speed > 0) {
            const impulse = (2 * speed) / 2;
            const impulseVector = {
              x: impulse * normal.x * BALL_BOUNCE,
              y: impulse * normal.y * BALL_BOUNCE
            };

            b1.vel.x -= impulseVector.x;
            b1.vel.y -= impulseVector.y;
            b2.vel.x += impulseVector.x;
            b2.vel.y += impulseVector.y;

            if (speed > 0.2) allCollisions.push({ type: 'ball', velocity: speed });

            const overlap = BALL_RADIUS * 2 - dist;
            b1.pos.x -= normal.x * overlap / 2;
            b1.pos.y -= normal.y * overlap / 2;
            b2.pos.x += normal.x * overlap / 2;
            b2.pos.y += normal.y * overlap / 2;
          }
        }
      }
    }
  }

  // 3. Pocket detection
  const pockets = [
    { x: 0, y: 0 }, { x: TABLE_WIDTH / 2, y: 0 }, { x: TABLE_WIDTH, y: 0 },
    { x: 0, y: TABLE_HEIGHT }, { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT }, { x: TABLE_WIDTH, y: TABLE_HEIGHT }
  ];

  activeBalls.forEach(ball => {
    for (const pocket of pockets) {
      if (distance(ball.pos, pocket) < POCKET_RADIUS) {
        ball.inPocket = true;
        ball.vel = { x: 0, y: 0 };
        break;
      }
    }
  });

  return allCollisions;
}

export function getTrajectory(cueBallPos: Vector, direction: Vector, balls: Ball[]): Vector[] {
  const points: Vector[] = [cueBallPos];
  let currentPos = { ...cueBallPos };
  let currentVel = { x: direction.x * 10, y: direction.y * 10 };
  
  const activeBalls = balls.filter(b => !b.inPocket && !b.isCue);

  // Simple step-based prediction for a few bounces or first hit
  for (let step = 0; step < 200; step++) {
    currentPos.x += currentVel.x;
    currentPos.y += currentVel.y;

    // Wall bounce
    if (currentPos.x < BALL_RADIUS || currentPos.x > TABLE_WIDTH - BALL_RADIUS) {
      currentVel.x *= -1;
      points.push({ ...currentPos });
      if (points.length > 3) break;
    }
    if (currentPos.y < BALL_RADIUS || currentPos.y > TABLE_HEIGHT - BALL_RADIUS) {
      currentVel.y *= -1;
      points.push({ ...currentPos });
      if (points.length > 3) break;
    }

    // Ball hit
    let hit = false;
    for (const ball of activeBalls) {
      if (distance(currentPos, ball.pos) < BALL_RADIUS * 2) {
        points.push({ ...currentPos });
        hit = true;
        break;
      }
    }
    if (hit) break;
  }

  points.push({ ...currentPos });
  return points;
}
