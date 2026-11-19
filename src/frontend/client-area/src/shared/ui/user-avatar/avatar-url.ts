/**
 * Gravatar URL helper.
 * The MD5 implementation is the legacy inlined function (kept byte-compatible).
 */
/* eslint-disable unicorn/prefer-code-point, unicorn/prefer-string-slice, no-useless-assignment -- legacy MD5 port */

function md5 (s: string): string {
  function L (k: number, d: number): number {
    return (k << d) | (k >>> (32 - d))
  }
  function K (G: number, k: number): number {
    const F = (G & 2_147_483_648)
    const H = (k & 2_147_483_648)
    const I = (G & 1_073_741_824)
    const d = (k & 1_073_741_824)
    const x = (G & 1_073_741_823) + (k & 1_073_741_823)
    if (I & d) {
      return (x ^ 2_147_483_648 ^ F ^ H)
    }
    if (I | d) {
      if (x & 1_073_741_824) {
        return (x ^ 3_221_225_472 ^ F ^ H)
      }
      return (x ^ 1_073_741_824 ^ F ^ H)
    }
    return (x ^ F ^ H)
  }
  function r (d: number, F: number, k: number): number {
    return (d & F) | ((~d) & k)
  }
  function q (d: number, F: number, k: number): number {
    return (d & k) | (F & (~k))
  }
  function p (d: number, F: number, k: number): number {
    return (d ^ F ^ k)
  }
  function n (d: number, F: number, k: number): number {
    return (F ^ (d | (~k)))
  }
  function u (G: number, F: number, aa: number, Z: number, k: number, H: number, I: number): number {
    G = K(G, K(K(r(F, aa, Z), k), I))
    return K(L(G, H), F)
  }
  function f (G: number, F: number, aa: number, Z: number, k: number, H: number, I: number): number {
    G = K(G, K(K(q(F, aa, Z), k), I))
    return K(L(G, H), F)
  }
  function D (G: number, F: number, aa: number, Z: number, k: number, H: number, I: number): number {
    G = K(G, K(K(p(F, aa, Z), k), I))
    return K(L(G, H), F)
  }
  function t (G: number, F: number, aa: number, Z: number, k: number, H: number, I: number): number {
    G = K(G, K(K(n(F, aa, Z), k), I))
    return K(L(G, H), F)
  }
  function e (G: string): number[] {
    let Z: number
    const F = G.length
    const x = F + 8
    const k = (x - (x % 64)) / 64
    const I = (k + 1) * 16
    const aa: number[] = Array.from({ length: I }, () => 0)
    let d = 0
    let H = 0
    while (H < F) {
      Z = (H - (H % 4)) / 4
      d = (H % 4) * 8
      aa[Z] = (aa[Z] | (G.charCodeAt(H) << d))
      H++
    }
    Z = (H - (H % 4)) / 4
    d = (H % 4) * 8
    aa[Z] = aa[Z] | (128 << d)
    aa[I - 2] = F << 3
    aa[I - 1] = F >>> 29
    return aa
  }
  function B (x: number): string {
    let k = ''
    let F = ''
    let G: number
    let d: number
    for (d = 0; d <= 3; d++) {
      G = (x >>> (d * 8)) & 255
      F = '0' + G.toString(16)
      k = k + F.substr(F.length - 2, 2)
    }
    return k
  }
  function J (k: string): string {
    k = k.replace(/rn/g, 'n')
    let d = ''
    for (let F = 0; F < k.length; F++) {
      const x = k.charCodeAt(F)
      if (x < 128) {
        d += String.fromCharCode(x)
      } else if ((x > 127) && (x < 2048)) {
        d += String.fromCharCode((x >> 6) | 192)
        d += String.fromCharCode((x & 63) | 128)
      } else {
        d += String.fromCharCode((x >> 12) | 224)
        d += String.fromCharCode(((x >> 6) & 63) | 128)
        d += String.fromCharCode((x & 63) | 128)
      }
    }
    return d
  }

  let P: number, h: number, E: number, v: number, g: number
  let Y: number, X: number, W: number, V: number
  const S = 7, Q = 12, N = 17, M = 22
  const A = 5, z = 9, y = 14, w = 20
  const o = 4, m = 11, l = 16, j = 23
  const U = 6, T = 10, R = 15, O = 21
  const encoded = J(s)
  const C = e(encoded)
  Y = 1_732_584_193
  X = 4_023_233_417
  W = 2_562_383_102
  V = 271_733_878
  for (P = 0; P < C.length; P += 16) {
    h = Y
    E = X
    v = W
    g = V
    Y = u(Y, X, W, V, C[P + 0], S, 3_614_090_360)
    V = u(V, Y, X, W, C[P + 1], Q, 3_905_402_710)
    W = u(W, V, Y, X, C[P + 2], N, 606_105_819)
    X = u(X, W, V, Y, C[P + 3], M, 3_250_441_966)
    Y = u(Y, X, W, V, C[P + 4], S, 4_118_548_399)
    V = u(V, Y, X, W, C[P + 5], Q, 1_200_080_426)
    W = u(W, V, Y, X, C[P + 6], N, 2_821_735_955)
    X = u(X, W, V, Y, C[P + 7], M, 4_249_261_313)
    Y = u(Y, X, W, V, C[P + 8], S, 1_770_035_416)
    V = u(V, Y, X, W, C[P + 9], Q, 2_336_552_879)
    W = u(W, V, Y, X, C[P + 10], N, 4_294_925_233)
    X = u(X, W, V, Y, C[P + 11], M, 2_304_563_134)
    Y = u(Y, X, W, V, C[P + 12], S, 1_804_603_682)
    V = u(V, Y, X, W, C[P + 13], Q, 4_254_626_195)
    W = u(W, V, Y, X, C[P + 14], N, 2_792_965_006)
    X = u(X, W, V, Y, C[P + 15], M, 1_236_535_329)
    Y = f(Y, X, W, V, C[P + 1], A, 4_129_170_786)
    V = f(V, Y, X, W, C[P + 6], z, 3_225_465_664)
    W = f(W, V, Y, X, C[P + 11], y, 643_717_713)
    X = f(X, W, V, Y, C[P + 0], w, 3_921_069_994)
    Y = f(Y, X, W, V, C[P + 5], A, 3_593_408_605)
    V = f(V, Y, X, W, C[P + 10], z, 38_016_083)
    W = f(W, V, Y, X, C[P + 15], y, 3_634_488_961)
    X = f(X, W, V, Y, C[P + 4], w, 3_889_429_448)
    Y = f(Y, X, W, V, C[P + 9], A, 568_446_438)
    V = f(V, Y, X, W, C[P + 14], z, 3_275_163_606)
    W = f(W, V, Y, X, C[P + 3], y, 4_107_603_335)
    X = f(X, W, V, Y, C[P + 8], w, 1_163_531_501)
    Y = f(Y, X, W, V, C[P + 13], A, 2_850_285_829)
    V = f(V, Y, X, W, C[P + 2], z, 4_243_563_512)
    W = f(W, V, Y, X, C[P + 7], y, 1_735_328_473)
    X = f(X, W, V, Y, C[P + 12], w, 2_368_359_562)
    Y = D(Y, X, W, V, C[P + 5], o, 4_294_588_738)
    V = D(V, Y, X, W, C[P + 8], m, 2_272_392_833)
    W = D(W, V, Y, X, C[P + 11], l, 1_839_030_562)
    X = D(X, W, V, Y, C[P + 14], j, 4_259_657_740)
    Y = D(Y, X, W, V, C[P + 1], o, 2_763_975_236)
    V = D(V, Y, X, W, C[P + 4], m, 1_272_893_353)
    W = D(W, V, Y, X, C[P + 7], l, 4_139_469_664)
    X = D(X, W, V, Y, C[P + 10], j, 3_200_236_656)
    Y = D(Y, X, W, V, C[P + 13], o, 681_279_174)
    V = D(V, Y, X, W, C[P + 0], m, 3_936_430_074)
    W = D(W, V, Y, X, C[P + 3], l, 3_572_445_317)
    X = D(X, W, V, Y, C[P + 6], j, 76_029_189)
    Y = D(Y, X, W, V, C[P + 9], o, 3_654_602_809)
    V = D(V, Y, X, W, C[P + 12], m, 3_873_151_461)
    W = D(W, V, Y, X, C[P + 15], l, 530_742_520)
    X = D(X, W, V, Y, C[P + 2], j, 3_299_628_645)
    Y = t(Y, X, W, V, C[P + 0], U, 4_096_336_452)
    V = t(V, Y, X, W, C[P + 7], T, 1_126_891_415)
    W = t(W, V, Y, X, C[P + 14], R, 2_878_612_391)
    X = t(X, W, V, Y, C[P + 5], O, 4_237_533_241)
    Y = t(Y, X, W, V, C[P + 12], U, 1_700_485_571)
    V = t(V, Y, X, W, C[P + 3], T, 2_399_980_690)
    W = t(W, V, Y, X, C[P + 10], R, 4_293_915_773)
    X = t(X, W, V, Y, C[P + 1], O, 2_240_044_497)
    Y = t(Y, X, W, V, C[P + 8], U, 1_873_313_359)
    V = t(V, Y, X, W, C[P + 15], T, 4_264_355_552)
    W = t(W, V, Y, X, C[P + 6], R, 2_734_768_916)
    X = t(X, W, V, Y, C[P + 13], O, 1_309_151_649)
    Y = t(Y, X, W, V, C[P + 4], U, 4_149_444_226)
    V = t(V, Y, X, W, C[P + 11], T, 3_174_756_917)
    W = t(W, V, Y, X, C[P + 2], R, 718_787_259)
    X = t(X, W, V, Y, C[P + 9], O, 3_951_481_745)
    Y = K(Y, h)
    X = K(X, E)
    W = K(W, v)
    V = K(V, g)
  }
  const i = B(Y) + B(X) + B(W) + B(V)
  return i.toLowerCase()
}

/** Exported for tests against known digests. */
export function md5Digest (value: string): string {
  return md5(value)
}

export function avatarUrl (email: string, size = 48): string {
  return `//www.gravatar.com/avatar/${md5(email ?? '')}.jpg?d=robohash&s=${size}`
}
