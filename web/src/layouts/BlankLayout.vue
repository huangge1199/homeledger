<script setup lang="ts">
// 登录 / setup / register 用的裸 layout
</script>

<template>
  <div class="blank">
    <RouterView />
  </div>
</template>

<style scoped>
.blank {
  min-height: 100vh;
  background:
    radial-gradient(800px 380px at 88% -12%, rgba(61, 109, 245, .16) 0%, transparent 58%),
    var(--hl-bg);
  display: grid;
  place-items: center;
  padding: 32px 16px;
}
</style>
