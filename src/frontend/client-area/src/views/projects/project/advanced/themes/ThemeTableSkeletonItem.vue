<template>
  <tbody class="">
    <tr
      v-for="item in 5"
      :key="item"
    >
      <td class="" />

      <td>
        <div class="name-container d-flex align-center">
          <v-skeleton-loader
            class="avatar mr-4"
            type="avatar"
          />

          <v-skeleton-loader
            class="names"
            type="heading, text, text"
          />
        </div>
      </td>

      <td class="">
        <v-skeleton-loader
          class="text"
          type="text"
        />
      </td>

      <td class="">
        <v-skeleton-loader
          class="text"
          type="text"
        />
      </td>

      <td class="">
        <v-skeleton-loader
          class="actions"
          type="avatar@3"
        />
      </td>
    </tr>
  </tbody>
</template>

<style lang="scss" scoped>
// The V2 `::v-deep` becomes `:deep()`.
tr td {
  &:first-child {
    display: none;
  }
}

.v-skeleton-loader {
  &.avatar {
    :deep(.v-skeleton-loader__avatar) {
      width: 64px;
      height: 64px;
      min-height: 64px;
      max-height: 64px;
      margin: 0;
    }
  }

  &.names {
    width: 400px;

    :deep(.v-skeleton-loader__heading) {
      height: 24px;
      width: 300px;
      border-radius: 3px;
      margin: 0 0 4px;
    }

    :deep(.v-skeleton-loader__text) {
      height: 8px;
      margin: 0 0 6px;
    }

    :deep(.v-skeleton-loader__text:nth-child(3)) {
      width: 70%;
    }
  }

  &.text {
    width: 126px;

    :deep(.v-skeleton-loader__text) {
      width: 80px;
      margin: 0 0 6px;
    }
  }

  &.actions {
    display: flex;
    flex-direction: row;

    :deep(.v-skeleton-loader__avatar) {
      height: 24px;
      width: 24px;
      min-height: 24px;
      max-height: 24px;
      margin: 0 0 0 16px;
    }
  }
}
</style>
