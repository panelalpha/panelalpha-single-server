<template>
  <div class="table-item item--collaborate">
    <div class="item">
      <collaborate-label />
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The click is the parent's `@click`
  // (the table calls `useCollaborationLink`), as legacy `@click.native` on the item.
  import CollaborateLabel from '@/views/projects/CollaborateLabel.vue'
</script>
