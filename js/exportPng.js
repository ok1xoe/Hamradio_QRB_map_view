// js/exportPng.js
export function exportMapAsPng({ map, hideContextMenu }) {
  hideContextMenu();

  map.once('rendercomplete', () => {
    const mapCanvas = document.createElement('canvas');
    const size = map.getSize();
    mapCanvas.width = size[0];
    mapCanvas.height = size[1];

    const mapContext = mapCanvas.getContext('2d');

    const canvases = map.getViewport().querySelectorAll('canvas');

    canvases.forEach((canvas) => {
      if (canvas.width === 0 || canvas.height === 0) return;

      const opacity = canvas.parentNode && canvas.parentNode.style
        ? canvas.parentNode.style.opacity
        : canvas.style.opacity;

      mapContext.globalAlpha = opacity === '' ? 1 : Number(opacity);

      const transform = canvas.style.transform;
      if (transform && transform.startsWith('matrix(')) {
        const values = transform
          .slice(7, -1)
          .split(',')
          .map(v => Number(v.trim()));
        mapContext.setTransform(values[0], values[1], values[2], values[3], values[4], values[5]);
      } else {
        mapContext.setTransform(1, 0, 0, 1, 0, 0);
      }

      mapContext.drawImage(canvas, 0, 0);
    });

    mapContext.setTransform(1, 0, 0, 1, 0, 0);
    mapContext.globalAlpha = 1;

    mapCanvas.toBlob((blob) => {
      if (!blob) return;

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const filename =
        `qrb-map-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    }, 'image/png');
  });

  map.renderSync();
}
