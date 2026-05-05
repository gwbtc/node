/-  *bitcoin-common
/+  b-ser=bitcoin-serialization
|%
::
++  genesis-block-header
  ^-  block-header
  :*  0x1
      0x0
      0x4a5e.1e4b.aab8.9f3a.3251.8a88.c31b.c87f.618f.7667.3e2c.c77a.b212.7b7a.fded.a33b
      1.231.006.505
      0x1d00.ffff
      0x7c2b.ac1d
  ==
++  params
  |%
  ++  max-future-block-time             ~h2
  ++  past-median-timespan               11  :: blocks
  ++  difficulty-adjustment-interval  2.016  :: blocks
  ++  pow-target-timespan              ~d14
  ++  pow-limit  0xffff.ffff.ffff.ffff.ffff.ffff.ffff.ffff.ffff.ffff.ffff.ffff.ffff.ffff
  --
::
++  hash-block-header
  |=  hed=block-header
  ^-  block-hash
  %+  shay  32
  %+  shay  80
  %+  can  3
  :~  4^version.hed
     32^previous-block-hash.hed
     32^merkle-root.hed
      4^time.hed
      4^bits.hed
      4^nonce.hed
  ==
::
:: +he
::   block header validation core            :: NOTE: currently assumes mainnet
++  he
  |_  [now=time hes=block-headers]
  ::
  +$  validation-result
    $@  %.y
    $:  failed-at=block-height
        validation-checks
    ==
  +$  validation-checks
    $:  valid-prev-hash=?
        valid-work-required=?
        valid-time-lower-bound=?
        valid-time-upper-bound=?
        valid-pow=?
    ==
  ::
  ++  validate-block-headers
    |=  mor=(list [block-height block-header])
    ^-  validation-result
    ?~  mor  %.y
    =/  res  (validate-block-header i.mor)
    ?^  res  res
    %=  $
      mor  t.mor
      hes  (put:on-block-headers hes i.mor)
    ==
  ::
  ++  validate-block-header
    |=  [het=block-height hed=block-header]
    ^-  validation-result
    =,  params
    ?:  =(0 het)
      %-  validate-genesis-block-header
          hed
    =/  haz  (hash-block-header hed)
    =/  lot
      =/  beg
        ?:  (lte het past-median-timespan)  ~
        :-  ~
        %+  sub
            het
        .+  past-median-timespan
      %^  lot:on-block-headers
          hes
          beg
          [~ het]
    =/  pre
      %-  need
      %-  ram:on-block-headers
          lot
    =/  prev-hash  (hash-block-header val.pre)
    =/  block-time  (from-unix:chrono:userlib time.hed)
    =/  median-time-past
      %-  from-unix:chrono:userlib
      =/  lis
        %+  sort  (tap:on-block-headers lot)
        |=  [a=[block-height block-header] b=[block-height block-header]]
        %+  lth
            time.a
            time.b
      =<  time.val
      %+  snag
          (div (lent lis) 2)
          lis
    =/  target  (de-compact-target:b-ser bits.hed)
    =/  next-work-required
      ^-  @ux
      ?.  =(0 (mod het difficulty-adjustment-interval))  bits.val.pre
      =/  epoch-first
        %+  got:on-block-headers
            hes
            (sub het difficulty-adjustment-interval)
      =/  actual-timespan
        %+  sub
        %-  from-unix:chrono:userlib  time.val.pre
        %-  from-unix:chrono:userlib  time.epoch-first
      =.  actual-timespan  (max actual-timespan (div pow-target-timespan 4))
      =.  actual-timespan  (min actual-timespan (mul pow-target-timespan 4))
      =/  previous-target  (de-compact-target:b-ser bits.val.pre)
      =/  next-target
        %+  min
            pow-limit
            (div (mul previous-target actual-timespan) pow-target-timespan)
      %-  en-compact-target:b-ser
          next-target
    =/  val
      %*  p  p=*validation-checks
        valid-prev-hash         =(prev-hash previous-block-hash.hed)
        valid-work-required     =(bits.hed next-work-required)
        valid-time-lower-bound  (gth block-time median-time-past)
        valid-time-upper-bound  (lte block-time (add now max-future-block-time))
        valid-pow               (lte haz target)
      ==
    ?:  ?&  valid-prev-hash.val
            valid-work-required.val
            valid-time-lower-bound.val
            valid-time-upper-bound.val
            valid-pow.val
        ==
      %.y
    :*  het
        val
    ==
  ::
  ++  validate-genesis-block-header
    |=  hed=block-header
    ^-  validation-result
    =/  gen  genesis-block-header
    ?:  =(hed gen)  %.y
    :-  0
    %*  p  p=*validation-checks
      valid-prev-hash         =(previous-block-hash.hed previous-block-hash.gen)
      valid-work-required     =(bits.hed bits.gen)
      valid-time-lower-bound  =(time.hed time.gen)
      valid-time-upper-bound  =(time.hed time.gen)
      valid-pow               |
    ==
  ::
  --
::
++  on-block-headers  ((on block-height block-header) lth)
::
--

