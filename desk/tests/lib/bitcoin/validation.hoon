/-  *bitcoin-common,
    b-net=bitcoin-network
/+  b-val=bitcoin-validation,
    b-ser=bitcoin-serialization,
    *test
/=  test-data  /tests/lib/bitcoin/data
|%
::
++  net  %mainnet
::
++  init-headers
  |=  hes=(list block-header)
  =/  las  header-next:test-data
  =/  now  (add ~d1 (from-unix:chrono:userlib time.las))
  =/  acc  *block-headers
  |-
  ^-  block-headers
  ?~  hes  acc
  =/  val  (~(validate-block-header he:b-val now net acc) i.hes)
  ?>  ?=  %valid  -.val
  =*  haz  block-hash.val
  =*  het  block-height.val
  =*  wok  chainwork.val
  %=  $
      hes  t.hes
      acc  (~(put by acc) haz het wok i.hes)
  ==
::
++  set-median-time
  |=  [tim=@ud haz=block-hash hez=block-headers]
  ^-  block-headers
  =/  num  past-median-timespan:params:b-val
  |-
  ?:  =(0 num)  hez
  =/  pre  (~(got by hez) haz)
  %=  $
      hez  (~(put by hez) haz pre(time.block-header tim))
      haz  previous-block-hash.block-header.pre
      num  (dec num)
  ==
::
++  init-headers-with-times
  |=  tims=(list @ud)
  ^-  block-headers
  =/  hes  (scag (lent tims) header-batch:test-data)
  =/  hez  (init-headers hes)
  :: assign timestamps in height order, retaining the original hashes as keys
  |-
  ?~  tims  hez
  ?>  ?=(^ hes)
  =/  haz  (make-block-hash:b-ser i.hes)
  =/  pre  (~(got by hez) haz)
  %=  $
      hez   (~(put by hez) haz pre(time.block-header i.tims))
      hes   t.hes
      tims  t.tims
  ==
::
:: :: valid-pow
:: :: the block-hash is lte the current target
::
++  test-block-hash-less-than-target-succeeds
  ^-  tang
  =/  hez  (init-headers header-batch:test-data)
  =/  nex  header-next:test-data
  :: the bits for the target testing against: 0x1d00.ffff
  ?>  =(0x1d00.ffff bits.nex)
  :: block 2.999 (the next header following the test batch) hashes to less than this target
  =/  haz  (make-block-hash:b-ser nex)
  ?>  =(0x95e8.8252.55d5.d1c6.ce53.e26a.d391.3a59.6e1c.80b6.ccbf.ed12.5d79.7991 haz)
  ?>  (lth haz (de-compact-target:b-ser bits.nex))
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  val  (~(validate-block-header he:b-val now net hez) nex)
  %-  expect
  !>  ?=(%valid -.val)
::
++  test-block-hash-greater-than-target-fails
  ^-  tang
  =/  hez  (init-headers header-batch:test-data)
  :: junk header that hashes to greater than the target for 0x1d00.ffff
  =/  nex
    ^-  block-header
    :*  0x3400.0000
        0x2b8.1b9c.30e2.5895.6531.af1b.812d.ea3d.3e9a.ed28.dbac.8c9f.ec3f.1554  :: prev-hash of last in the test batch
        0xa01d.2e75.9723.7f24.1bb9.79dd.6f4a.f5ad.b0c2.c1c6.049c.a1fe.2d26.29b1.3cba.afa0
        1.791.513.876
        0x1d00.ffff
        0x3aa1.fe92
    ==
  =/  haz  (make-block-hash:b-ser nex)
  ?>  =(0x1d00.ffff bits.nex)
  ?>  =(0x5b29.fbf0.839f.0df9.41cc.d9f9.decd.7ef6.52af.d9f0.a366.7bbf.2f79.8f46.6ada.b9e1 haz)
  ?>  (gth haz (de-compact-target:b-ser bits.nex))
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  val  (~(validate-block-header he:b-val now net hez) nex)
  %-  expect
  !>
  ?&  ?=(%invalid -.val)
      !valid-pow.validation-checks.val
  ==
::
:: :: valid-prev-hash
:: :: the header's prev hash is known
::
++  test-matching-prev-hash-succeeds
  ^-  tang
  =/  hez  (init-headers header-batch:test-data)
  =/  nex  header-next:test-data
  =/  pre  (~(got by hez) previous-block-hash.nex)
  ?>  =(previous-block-hash.nex (make-block-hash:b-ser block-header.pre))
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  val  (~(validate-block-header he:b-val now net hez) nex)
  %-  expect
  !>  ?=(%valid -.val)
::
++  test-missing-prev-hash-fails
  ^-  tang
  =/  hez  (init-headers header-batch:test-data)
  =/  nex  header-next:test-data
  =.  hez  (~(del by hez) previous-block-hash.nex)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  val  (~(validate-block-header he:b-val now net hez) nex)
  %-  expect
  !>  ?=(%orphan -.val)
::
:: :: valid-time-upper-bound
:: :: the block time is lte the max future time
::
++  test-block-time-less-than-max-succeeds
  ^-  tang
  =/  hez  (init-headers header-batch:test-data)
  =/  nex  header-next:test-data
  =/  tim  (from-unix:chrono:userlib time.nex)
  =/  now  (add ~s1 (sub tim max-future-block-time:params:b-val))
  =/  max-time  (add now max-future-block-time:params:b-val)
  ?>  =(~s1 (sub max-time tim))
  =/  val  (~(validate-block-header he:b-val now net hez) nex)
  %-  expect
  !>  ?=(%valid -.val)
::
++  test-block-time-equal-to-max-succeeds
  ^-  tang
  =/  hez  (init-headers header-batch:test-data)
  =/  nex  header-next:test-data
  =/  tim  (from-unix:chrono:userlib time.nex)
  =/  now  (sub tim max-future-block-time:params:b-val)
  ?>  =(tim (add now max-future-block-time:params:b-val))
  =/  val  (~(validate-block-header he:b-val now net hez) nex)
  %-  expect
  !>  ?=(%valid -.val)
::
++  test-block-time-greater-than-max-fails
  ^-  tang
  =/  hez  (init-headers header-batch:test-data)
  =/  nex  header-next:test-data
  =/  tim  (from-unix:chrono:userlib time.nex)
  =/  now  (sub (sub tim max-future-block-time:params:b-val) ~s1)
  =/  max-time  (add now max-future-block-time:params:b-val)
  ?>  =(~s1 (sub tim max-time))
  =/  val  (~(validate-block-header he:b-val now net hez) nex)
  %-  expect
  !>
  ?&  ?=(%invalid -.val)
      !valid-time-upper-bound.validation-checks.val
  ==
::
:: :: valid-time-lower-bound
:: :: the block time is gth the median time passed
::
++  test-block-time-greater-than-median-succeeds
  ^-  tang
  =/  hez  (init-headers header-batch:test-data)
  =/  nex  header-next:test-data
  =/  pre  (~(got by hez) previous-block-hash.nex)
  =/  tim  (dec time.nex)
  :: set every timestamp in the median window, ending at the immediate previous header
  =.  hez  (set-median-time tim previous-block-hash.nex hez)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  med  (~(get-median-time-past he:b-val now net hez) +(block-height.pre) nex)
  ?>  =(med (from-unix:chrono:userlib tim))
  ?>  =(~s1 (sub (from-unix:chrono:userlib time.nex) med))
  =/  val  (~(validate-block-header he:b-val now net hez) nex)
  %-  expect
  !>  ?=(%valid -.val)
::
++  test-block-time-equal-to-median-fails
  ^-  tang
  =/  hez  (init-headers header-batch:test-data)
  =/  nex  header-next:test-data
  =/  pre  (~(got by hez) previous-block-hash.nex)
  =/  tim  time.nex
  =.  hez  (set-median-time tim previous-block-hash.nex hez)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  med  (~(get-median-time-past he:b-val now net hez) +(block-height.pre) nex)
  ?>  =(med (from-unix:chrono:userlib tim))
  ?>  =(med (from-unix:chrono:userlib time.nex))
  =/  val  (~(validate-block-header he:b-val now net hez) nex)
  %-  expect
  !>
  ?&  ?=(%invalid -.val)
      !valid-time-lower-bound.validation-checks.val
      valid-prev-hash.validation-checks.val
      valid-work-required.validation-checks.val
      valid-time-upper-bound.validation-checks.val
      valid-pow.validation-checks.val
  ==
::
++  test-block-time-less-than-median-fails
  ^-  tang
  =/  hez  (init-headers header-batch:test-data)
  =/  nex  header-next:test-data
  =/  pre  (~(got by hez) previous-block-hash.nex)
  =/  tim  +(time.nex)
  =.  hez  (set-median-time tim previous-block-hash.nex hez)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  med  (~(get-median-time-past he:b-val now net hez) +(block-height.pre) nex)
  ?>  =(med (from-unix:chrono:userlib tim))
  ?>  =(~s1 (sub med (from-unix:chrono:userlib time.nex)))
  =/  val  (~(validate-block-header he:b-val now net hez) nex)
  %-  expect
  !>
  ?&  ?=(%invalid -.val)
      !valid-time-lower-bound.validation-checks.val
      valid-prev-hash.validation-checks.val
      valid-work-required.validation-checks.val
      valid-time-upper-bound.validation-checks.val
      valid-pow.validation-checks.val
  ==
::
:: :: valid-time-lower-bound
:: :: the median time passed is the median of the previous past-median-timespan blocks
::
++  test-median-time-past-selects-middle-of-three
  ^-  tang
  =/  hez  (init-headers-with-times ~[100 200 300])
  =/  nex  (snag 3 header-batch:test-data)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  med  (~(get-median-time-past he:b-val now net hez) 3 nex)
  %-  expect
  !>  =(med (from-unix:chrono:userlib 200))
::
++  test-median-time-past-selects-upper-middle-of-two
  ^-  tang
  =/  hez  (init-headers-with-times ~[100 200])
  =/  nex  (snag 2 header-batch:test-data)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  :: index (div 2 2) selects the larger timestamp, rather than their average
  =/  med  (~(get-median-time-past he:b-val now net hez) 2 nex)
  %-  expect
  !>  =(med (from-unix:chrono:userlib 200))
::
++  test-median-time-past-selects-only-timestamp
  ^-  tang
  =/  hez  (init-headers-with-times ~[100])
  =/  nex  (snag 1 header-batch:test-data)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  med  (~(get-median-time-past he:b-val now net hez) 1 nex)
  %-  expect
  !>  =(med (from-unix:chrono:userlib 100))
::
++  test-median-time-past-sorts-three-unordered-timestamps
  ^-  tang
  =/  hez  (init-headers-with-times ~[200 300 100])
  =/  nex  (snag 3 header-batch:test-data)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  med  (~(get-median-time-past he:b-val now net hez) 3 nex)
  %-  expect
  !>  =(med (from-unix:chrono:userlib 200))
::
++  test-median-time-past-selects-middle-of-full-window
  ^-  tang
  ?>  =(11 past-median-timespan:params:b-val)
  =/  hez
    (init-headers-with-times ~[1.100 100 900 300 700 500 600 400 800 200 1.000])
  =/  nex  (snag 11 header-batch:test-data)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  med  (~(get-median-time-past he:b-val now net hez) 11 nex)
  %-  expect
  !>  =(med (from-unix:chrono:userlib 600))
::
++  test-median-time-past-excludes-headers-before-window
  ^-  tang
  ?>  =(11 past-median-timespan:params:b-val)
  :: the genesis timestamp is outside the previous eleven blocks
  =/  hez
    (init-headers-with-times ~[10.000 100 200 300 400 500 600 700 800 900 1.000 1.100])
  =/  nex  (snag 12 header-batch:test-data)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  med  (~(get-median-time-past he:b-val now net hez) 12 nex)
  %-  expect
  !>  =(med (from-unix:chrono:userlib 600))
::
:: :: valid-work-required
:: :: the header's bits equal the expected bits
::
++  test-header-bits-equal-to-expected-succeeds
  ^-  tang
  =/  hez  (init-headers header-batch:test-data)
  =/  nex  header-next:test-data
  =/  pre  (~(got by hez) previous-block-hash.nex)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  bis
    (~(get-next-work-required he:b-val now net hez) block-header.pre +(block-height.pre) nex)
  ?>  =(0x1d00.ffff bis)
  =.  nex  nex(bits bis)
  =/  val  (~(validate-block-header he:b-val now net hez) nex)
  %-  expect
  !>  ?=(%valid -.val)
::
++  test-header-bits-less-than-expected-fails
  ^-  tang
  =/  hez  (init-headers header-batch:test-data)
  =/  nex  header-next:test-data
  =/  pre  (~(got by hez) previous-block-hash.nex)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  bis
    (~(get-next-work-required he:b-val now net hez) block-header.pre +(block-height.pre) nex)
  ?>  =(0x1d00.ffff bis)
  =.  nex  nex(bits (dec bis))
  ?>  =(1 (sub bis bits.nex))
  =/  val  (~(validate-block-header he:b-val now net hez) nex)
  %-  expect
  !>
  ?&  ?=(%invalid -.val)
      !valid-work-required.validation-checks.val
  ==
::
++  test-header-bits-greater-than-expected-fails
  ^-  tang
  =/  hez  (init-headers header-batch:test-data)
  =/  nex  header-next:test-data
  =/  pre  (~(got by hez) previous-block-hash.nex)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  bis
    (~(get-next-work-required he:b-val now net hez) block-header.pre +(block-height.pre) nex)
  ?>  =(0x1d00.ffff bis)
  =.  nex  nex(bits +(bis))
  ?>  =(1 (sub bits.nex bis))
  =/  val  (~(validate-block-header he:b-val now net hez) nex)
  %-  expect
  !>
  ?&  ?=(%invalid -.val)
      !valid-work-required.validation-checks.val
  ==
::
:: :: valid-work-required
:: :: the expected bits are computed properly
::
++  test-height-less-than-interval-does-not-retarget
  ^-  tang
  =/  nex  header-next:test-data
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  adj  (~(should-adjust-difficulty he:b-val now net *block-headers) 2.015)
  %-  expect
  !>  !adj
::
++  test-height-equal-to-interval-retargets
  ^-  tang
  =/  nex  header-next:test-data
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  adj  (~(should-adjust-difficulty he:b-val now net *block-headers) 2.016)
  %-  expect
  !>  adj
::
++  test-height-greater-than-interval-does-not-retarget
  ^-  tang
  =/  nex  header-next:test-data
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  adj  (~(should-adjust-difficulty he:b-val now net *block-headers) 2.017)
  %-  expect
  !>  !adj
::
++  test-height-second-interval-retargets
  ^-  tang
  =/  nex  header-next:test-data
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  adj  (~(should-adjust-difficulty he:b-val now net *block-headers) 4.032)
  %-  expect
  !>  adj
::
++  test-height-less-than-interval-preserves-previous-bits
  ^-  tang
  =/  hez  (init-headers (scag 2.015 header-batch:test-data))
  =/  nex  (snag 2.015 header-batch:test-data)
  =/  pre  (~(got by hez) previous-block-hash.nex)
  ?>  =(0x1d00.ffff bits.block-header.pre)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  bis
    (~(get-next-work-required he:b-val now net hez) block-header.pre 2.015 nex)
  %-  expect
  !>  =(bits.block-header.pre bis)
::
++  test-height-greater-than-interval-preserves-previous-bits
  ^-  tang
  =/  hez  (init-headers (scag 2.017 header-batch:test-data))
  =/  nex  (snag 2.017 header-batch:test-data)
  =/  pre  (~(got by hez) previous-block-hash.nex)
  ?>  =(0x1d00.ffff bits.block-header.pre)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  =/  bis
    (~(get-next-work-required he:b-val now net hez) block-header.pre 2.017 nex)
  %-  expect
  !>  =(bits.block-header.pre bis)
::
++  retarget-for-timespan
  |=  [span=@ud bis=@ux]
  ^-  @ux
  ?>  =(2.016 difficulty-adjustment-interval:params:b-val)
  ?>  =(~d14 pow-target-timespan:params:b-val)
  =/  hes  (scag 2.016 header-batch:test-data)
  =/  hez  (init-headers hes)
  =/  nex  (snag 2.016 header-batch:test-data)
  =/  gen  ?>(?=(^ hes) i.hes)
  =/  haz  (make-block-hash:b-ser gen)
  =/  fir  (~(got by hez) haz)
  =.  hez  (~(put by hez) haz fir(time.block-header 1.200.000.000))
  =/  pre  (~(got by hez) previous-block-hash.nex)
  =.  pre
    pre(time.block-header (add 1.200.000.000 span), bits.block-header bis)
  =.  hez  (~(put by hez) previous-block-hash.nex pre)
  =/  now  (add ~d1 (from-unix:chrono:userlib time.nex))
  (~(get-next-work-required he:b-val now net hez) block-header.pre 2.016 nex)
::
++  test-retarget-caps-target-at-pow-limit
  ^-  tang
  =/  bis  (retarget-for-timespan 4.838.400 0x1d00.ffff)
  %-  expect
  !>  =(0x1d00.ffff bis)
::
++  test-retarget-clamps-timespan-below-minimum
  ^-  tang
  =/  bis  (retarget-for-timespan 302.399 0x1c18.0000)
  %-  expect
  !>  =(0x1c06.0000 bis)
::
++  test-retarget-timespan-equal-to-minimum
  ^-  tang
  =/  bis  (retarget-for-timespan 302.400 0x1c18.0000)
  %-  expect
  !>  =(0x1c06.0000 bis)
::
++  test-retarget-timespan-just-above-minimum
  ^-  tang
  =/  bis  (retarget-for-timespan 302.401 0x1c18.0000)
  %-  expect
  !>  =(0x1c06.0001 bis)
::
++  test-retarget-timespan-just-below-maximum
  ^-  tang
  =/  bis  (retarget-for-timespan 4.838.399 0x1c18.0000)
  %-  expect
  !>  =(0x1c5f.fffe bis)
::
++  test-retarget-timespan-equal-to-maximum
  ^-  tang
  =/  bis  (retarget-for-timespan 4.838.400 0x1c18.0000)
  %-  expect
  !>  =(0x1c60.0000 bis)
::
++  test-retarget-clamps-timespan-above-maximum
  ^-  tang
  =/  bis  (retarget-for-timespan 4.838.401 0x1c18.0000)
  %-  expect
  !>  =(0x1c60.0000 bis)
::
++  test-retarget-doubles-target-for-double-timespan
  ^-  tang
  =/  bis  (retarget-for-timespan 2.419.200 0x1c18.0000)
  %-  expect
  !>  =(0x1c30.0000 bis)
::
++  test-retarget-halves-target-for-half-timespan
  ^-  tang
  =/  bis  (retarget-for-timespan 604.800 0x1c18.0000)
  %-  expect
  !>  =(0x1c0c.0000 bis)
::
++  test-retarget-preserves-target-for-expected-timespan
  ^-  tang
  =/  bis  (retarget-for-timespan 1.209.600 0x1c18.0000)
  %-  expect
  !>  =(0x1c18.0000 bis)
::
--

