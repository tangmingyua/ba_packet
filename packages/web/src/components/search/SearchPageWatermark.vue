<template>
  <Teleport to="body">
    <div
      class="search-page-watermark"
      aria-hidden="true"
      :style="{ backgroundImage: watermarkPattern }"
    />
  </Teleport>
</template>

<script setup>
const text = 'RIKING内部资料-禁止外传';

function buildWatermarkPattern(label) {
  const safe = label
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="168" viewBox="0 0 320 168">
    <g transform="translate(160,84) rotate(-22) translate(-160,-84)">
      <text
        x="20"
        y="92"
        font-family="system-ui,-apple-system,'Segoe UI',sans-serif"
        font-size="14"
        font-weight="600"
        letter-spacing="0.04em"
        fill="#475569"
        fill-opacity="0.09"
      >${safe}</text>
    </g>
  </svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const watermarkPattern = buildWatermarkPattern(text);
</script>

<style scoped>
.search-page-watermark {
  position: fixed;
  inset: 0;
  z-index: 25;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  background-repeat: repeat;
  background-size: 320px 168px;
  background-position: center;
}
</style>
