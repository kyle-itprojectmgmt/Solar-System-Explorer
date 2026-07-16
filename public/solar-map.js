  // ── Star field ──
  const canvas = document.getElementById('starCanvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    drawStars();
  }

  function drawStars() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const count = Math.floor((canvas.width * canvas.height) / 3000);
    for (let i = 0; i < count; i++) {
      const x    = Math.random() * canvas.width;
      const y    = Math.random() * canvas.height;
      const r    = Math.random() * 1.2;
      const alpha = 0.3 + Math.random() * 0.7;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
    }
  }

  resize();
  window.addEventListener('resize', resize);