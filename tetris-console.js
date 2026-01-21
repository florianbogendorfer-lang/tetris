(() => {
  const WIDTH = 10;
  const HEIGHT = 20;
  const BLOCK = 24;
  const COLORS = [
    "#000000",
    "#00f0f0",
    "#0000f0",
    "#f0a000",
    "#f0f000",
    "#00f000",
    "#a000f0",
    "#f00000",
  ];

  const SHAPES = {
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    J: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    O: [
      [1, 1],
      [1, 1],
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
  };

  const TYPES = Object.keys(SHAPES);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const container = document.createElement("div");
  const info = document.createElement("div");
  const controls = document.createElement("div");

  canvas.width = WIDTH * BLOCK;
  canvas.height = HEIGHT * BLOCK;
  canvas.style.border = "2px solid #111";
  canvas.style.background = "#111";

  info.style.fontFamily = "monospace";
  info.style.color = "#f5f5f5";
  info.style.marginTop = "8px";

  controls.style.fontFamily = "monospace";
  controls.style.color = "#bbb";
  controls.style.marginTop = "6px";
  controls.textContent = "Controls: ←/→ = move, ↓ = soft drop, ↑ = rotate, Space = hard drop, P = pause";

  container.style.position = "fixed";
  container.style.right = "16px";
  container.style.bottom = "16px";
  container.style.padding = "12px";
  container.style.background = "rgba(0,0,0,0.8)";
  container.style.borderRadius = "8px";
  container.style.zIndex = "2147483647";
  container.appendChild(canvas);
  container.appendChild(info);
  container.appendChild(controls);
  document.body.appendChild(container);

  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(0));
  let current = null;
  let score = 0;
  let lines = 0;
  let level = 1;
  let dropInterval = 800;
  let dropCounter = 0;
  let lastTime = 0;
  let paused = false;
  let gameOver = false;

  const rotateMatrix = (matrix) => matrix[0].map((_, i) => matrix.map((row) => row[i]).reverse());

  const randomPiece = () => {
    const type = TYPES[Math.floor(Math.random() * TYPES.length)];
    const shape = SHAPES[type].map((row) => row.slice());
    const colorIndex = TYPES.indexOf(type) + 1;
    return {
      x: Math.floor(WIDTH / 2) - Math.ceil(shape[0].length / 2),
      y: 0,
      matrix: shape,
      color: colorIndex,
    };
  };

  const merge = (piece) => {
    piece.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          grid[piece.y + y][piece.x + x] = piece.color;
        }
      });
    });
  };

  const collide = (piece) => {
    for (let y = 0; y < piece.matrix.length; y += 1) {
      for (let x = 0; x < piece.matrix[y].length; x += 1) {
        if (piece.matrix[y][x]) {
          const gridY = piece.y + y;
          const gridX = piece.x + x;
          if (gridX < 0 || gridX >= WIDTH || gridY >= HEIGHT) {
            return true;
          }
          if (gridY >= 0 && grid[gridY][gridX]) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const clearLines = () => {
    let cleared = 0;
    for (let y = HEIGHT - 1; y >= 0; y -= 1) {
      if (grid[y].every((value) => value > 0)) {
        grid.splice(y, 1);
        grid.unshift(Array(WIDTH).fill(0));
        cleared += 1;
        y += 1;
      }
    }
    if (cleared > 0) {
      const points = [0, 40, 100, 300, 1200];
      score += points[cleared] * level;
      lines += cleared;
      level = Math.floor(lines / 10) + 1;
      dropInterval = Math.max(100, 800 - (level - 1) * 70);
    }
  };

  const drawCell = (x, y, colorIndex) => {
    context.fillStyle = COLORS[colorIndex];
    context.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
    context.strokeStyle = "rgba(0,0,0,0.3)";
    context.strokeRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
  };

  const draw = () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    grid.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          drawCell(x, y, value);
        }
      });
    });
    if (current) {
      current.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value) {
            drawCell(current.x + x, current.y + y, current.color);
          }
        });
      });
    }
  };

  const updateInfo = () => {
    info.textContent = `Score: ${score} | Lines: ${lines} | Level: ${level}`;
  };

  const spawn = () => {
    current = randomPiece();
    if (collide(current)) {
      gameOver = true;
    }
  };

  const move = (dir) => {
    current.x += dir;
    if (collide(current)) {
      current.x -= dir;
    }
  };

  const drop = () => {
    current.y += 1;
    if (collide(current)) {
      current.y -= 1;
      merge(current);
      clearLines();
      spawn();
    }
    dropCounter = 0;
  };

  const hardDrop = () => {
    while (!collide(current)) {
      current.y += 1;
    }
    current.y -= 1;
    merge(current);
    clearLines();
    spawn();
    dropCounter = 0;
  };

  const rotate = () => {
    const rotated = rotateMatrix(current.matrix);
    const previous = current.matrix;
    current.matrix = rotated;
    if (collide(current)) {
      current.matrix = previous;
    }
  };

  const update = (time = 0) => {
    if (gameOver) {
      info.textContent = `Game Over! Final Score: ${score}. Reload to play again.`;
      return;
    }
    if (paused) {
      info.textContent = `Paused | Score: ${score} | Lines: ${lines} | Level: ${level}`;
      requestAnimationFrame(update);
      return;
    }
    const deltaTime = time - lastTime;
    lastTime = time;
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
      drop();
    }
    draw();
    updateInfo();
    requestAnimationFrame(update);
  };

  const handleKey = (event) => {
    if (gameOver) return;
    if (event.key === "ArrowLeft") {
      move(-1);
    } else if (event.key === "ArrowRight") {
      move(1);
    } else if (event.key === "ArrowDown") {
      drop();
    } else if (event.key === "ArrowUp") {
      rotate();
    } else if (event.code === "Space") {
      hardDrop();
    } else if (event.key.toLowerCase() === "p") {
      paused = !paused;
    }
  };

  document.addEventListener("keydown", handleKey);

  const cleanup = () => {
    document.removeEventListener("keydown", handleKey);
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  };

  window.__tetrisConsoleCleanup = cleanup;

  spawn();
  updateInfo();
  update();
})();
