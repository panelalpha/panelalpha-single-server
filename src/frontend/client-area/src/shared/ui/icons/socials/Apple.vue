<template>
  <svg
    fill="none"
    height="24"
    viewBox="0 0 24 24"
    width="24"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
  >
    <rect :fill="'url(#' + uid0 + ')'" height="23.9999" width="19.5351" x="1.80389" />

    <defs>
      <pattern :id="uid0" height="1" patternContentUnits="objectBoundingBox" width="1">
        <use transform="scale(0.0128205 0.0104167)" xlink:href="#image0_6514_4578" />
      </pattern>

      <image
        id="image0_6514_4578"
        height="96"
        preserveAspectRatio="none"
        width="78"
        xlink:href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAE4AAABgCAYAAACzDERbAAAFR0lEQVR4Ae3BD4zVdQEA8M/7vscxByISf7wyJBTHRDq30Ll0ERoNDnNMigZGi5pFVq6VtbFIa3Nl5GrFcqaxUsM/g4YmMsCtIuYINrJSsgsYIggnGGHAiYfci9txuz/cvff7vXuH7+6+n09G/3QJPoGpqMHFGIeDyiSn/wiYja9hKjI6GoWDyiSnf6jFj3Cl7mWUUU7fNhr3Y47ijiijnL7rI3gC1YprRL0yyumbFuBXqJJMHd5RRjl9z+fxEILkNiuzoG+ZhQcRpLNemQV9x2VYgax0jmKdMgv6hiwexQXSewINyizoG27HtdJrws/0gqDyDcf3lGYltusFQeW7AyOk14DFeklQ2apwu9Lchd16SVDZZmGM9Dbgp3pRUNnmSG8H5qFJLwoqVwY3SmcfZuCwXpZTud6PiyT3MmrxinMgp3JdLrmVuA1vOkdyKtcoxR3AN/G4cyyncuV0rx4/xzIc8y7IqVwHtcljLzZiNZ5Fo3dRRuUKeC+qcAhHVZCM8hqBGlyGizAUeRzBbvwddcjrHZfiw6jBeIzCYJzCUdRjN17CFryqRBk9NwVzUYsrkFHY61iHVViPk0qXwbWYi5sxXjo78TRW4AUpZJQmh3n4Bq5SuoN4FA+hTnLV+BwWYoLy2IwfYg3yishIbyZ+gonKJ48/YTmewnFnq8IMLMQsDNI7NuEreFEBGcldgF/gVr2rAX/AFtTjQkzBdFzo3GjEEtyHvC5kJDMZq3GpgWUVPou3dJJV3DRsQLWB5wpcj1Vo1E5WYTfgWQw1cI3DNXgSp5yR1b2rsB5DROMxBmuckdW1kfgjRotafQibsctpOV1bjrGiVidwJ55zRs7ZFuBmUat9mI1t2snpaBh+LGr1L0zHPp3kdPQtjBE124FpqNeFoM1w3CFq9gZmol43gjZfwDBRE27FLgUELTL4oqjZMmxQRNDialwueg1LJBC0uEXU7Ps4JoGgxQzRa3hYQgEjMFm0HI0SCrgGQfSYFAJqRDtRJ4WAiaJNUgoYJ/qblAKqRbukFPAe0etSCjhfdExKAVWi1IKo2RApBTSKRksp4LjoA1IKOCL6oJQCDomuk1LAftEkjJVCwB5RBp+WQsBOUbPbECQU8LKo2QR8UkIBL4pa3YPBEgg4hL2iZhOwWAJBiy2iVt/BdYoIWjwvapXDSoxVQFaLE1gkanU+ZmAVjutCVouD+DKGiFqNwk1Ygzd1ktUij8moEbU3EvOwFXu0k9Umh7mizoZiAQbheZxyWlabPfg6Bok6C5iKT+EV7MhqcxI1mCTqzkjMx7Sgo9+KkjgcdLQOB0TFPB50dBK/FhXyHzwTnO2XeEfUnUdwIjjbq/idqCtNuN9pQdeWIi/q7GnsdFrQtb9iraize50RdO9u5EWt1mKrM4LubcOTomZNWKKdoLDFeEu0Ai9oJ6uwIwiYZuA6itk4qp2guKXYbuC6C/t1EhT3NhbipIHnL1imC1nJ7EcTbjBwNGAmDulCkNy92GjguBN1uhEkdwqfwRv6v9/jAQVkpfM/bMc8ZPRPe1GLBgVkpbcDWUzV/7yNWdihiKzS/Bk1mKh/WYRnJJBVmjzWYDrep3/4Ae6TUFbpTmI1ajFa37YM35ZCRs+NwlpM0XP/xnPYijrU4ziyGIaLcSWux8cxXM/kcQ/uRl4KGeUxBA9ivvQO42H8Bv+Q3GDchEW4ERnp/BdfwkolyCivuViKSxS3DQ/gMTTomUn4KuZjmMIa8Qi+i3olyii/KszBLbga1cjjEP6JTXgKLym/8/AxfBSTUY3zcAw7sRGrcEAP/R+f/BggVS4LcAAAAABJRU5ErkJggg=="
      />
    </defs>
  </svg>
</template>

<script lang="ts" setup>
  import { useId } from 'vue'

  const _uid = useId().replace(/:/g, '')
  const uid0 = 'pattern0_6514_4578_' + _uid
</script>
