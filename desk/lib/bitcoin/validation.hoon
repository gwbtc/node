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
  ++  min-transaction-weight  (mul witness-scale-factor 60)
  ++  witness-scale-factor                4
  ++  max-block-weight            4.000.000
  ::
  ++  max-future-block-time             ~h2
  ++  past-median-timespan               11  :: blocks
  ++  difficulty-adjustment-interval  2.016  :: blocks
  ++  pow-target-timespan              ~d14
  ++  pow-limit  0xffff.ffff.ffff.ffff.ffff.ffff.ffff.ffff.ffff.ffff.ffff.ffff.ffff.ffff
  --
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
    =/  haz  (make-block-hash:b-ser hed)
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
    =/  prev-hash  (make-block-hash:b-ser val.pre)
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
:: +me
::   merkle block core
++  me
  |_  mer=merkle-block
  ++  me-core  .
  ++  me-give  |=(arg=merkle-block me-core(mer arg))
  ++  me-take  mer
  ++  me-make
    |=  [txs=(set txid) bok=block]
    =;  mep
      %_  me-core
          mer  [-.bok mep]
      ==
    %-  build-partial-merkle-tree
    %+  turn  txs.bok
    |=  txn=transaction
    =/  tid  (make-txid:b-ser txn)
    :-  (~(has in txs) tid)
        tid
  ::
  ++  me-verify
    |=  [hed=block-header txs=(set txid)]
    ^-  ?
    ?.  validate-merkle-block  |
    =/  has-txs
      ^-  ?
      =/  haz  (silt hashes.mer)
      %-  ~(all in txs)
      |=  txn=txid
      %-  ~(has in haz)
          txn
    ?.  &(has-txs =(hed -.mer))  |
    =/  [rot=@ux mur=merkle-block]  extract-merkle-root
    =/  consumed-except-padding
      ^-  ?
      =/  len  (lent flags.mur)
      ?:  (gte len 8)  |
      %+  levy  flags.mur
      |=  lag=flag
      .=  0
          lag
    ?.  &(consumed-except-padding ?=(~ hashes.mur))  |
    .=  merkle-root.hed
        rot
  ::
  ++  validate-merkle-block
    ^-  ?
    =,  params
    =/  hash-len  (lent hashes.mer)
    =/  flag-len  (lent flags.mer)
    ?!
    ?|  =(0 total-txs.mer)
        (gth total-txs.mer (div max-block-weight min-transaction-weight))
        (gth hash-len total-txs.mer)
        (lth flag-len hash-len)
    ==
  ::
  ++  extract-merkle-root
    =/  pos  0
    =/  het  (calc-tree-height total-txs.mer)
    |-
    ^-  [@ux merkle-block]
    =^  parent-of-match  mer
      :-  (head flags.mer)
      %_  mer
          flags  (tail flags.mer)
      ==
    ?:  ?|  =(0 het)
            !parent-of-match
        ==
      :-  (head hashes.mer)
      %_  mer
          hashes  (tail hashes.mer)
      ==
    =:  het  (dec het)
        pos  (mul pos 2)
      ==
    =^  lef  mer  $
    =^  rig  mer
      =.  pos  +(pos)
      ?:  (lth pos (calc-tree-width het total-txs.mer))  $
      :-  lef  mer
    :_  mer
    %+  shay  64
    %+  can  3
    :~  32^lef
        32^rig
    ==
  ::
  ++  build-partial-merkle-tree
    |=  block-txs=(list [match=? =txid])
    ^-  partial-merkle-tree
    =/  pos  0
    =/  tot  (lent block-txs)
    =/  het  (calc-tree-height tot)
    =/  acc  %*(p p=*partial-merkle-tree total-txs tot)
    |^
    ^-  partial-merkle-tree
    =/  parent-of-match
      ^-  ?
      =/  p  (lsh [0 het] pos)
      |-
      ?.  &((lth p (lsh [0 het] +(pos))) (lth p total-txs.acc))  |
      ?:  match:(snag p block-txs)  &
      %=  $
          p  +(p)
      ==
    =.  flags.acc  [parent-of-match flags.acc]
    ?:  ?|  =(0 het)
            !parent-of-match
        ==
      %_  acc
          hashes  [calc-hash hashes.acc]
      ==
    =:  het  (dec het)
        pos  (mul pos 2)
      ==
    =.  acc  $
    =.  pos  +(pos)
    ?:  (lth pos (calc-tree-width het total-txs.acc))  $
    acc
    ::
    ++  calc-hash
      ^-  @ux
      ?:  =(0 het)  txid:(snag pos block-txs)
      =:  het  (dec het)
          pos  (mul pos 2)
        ==
      =/  lef  calc-hash
      =/  rig
        =.  pos  +(pos)
        ?:  (lth pos (calc-tree-width het total-txs.acc))  calc-hash
        lef
      %+  shay  64
      %+  can  3
      :~  32^lef
          32^rig
      ==
    ::
    --
  ::
  ++  calc-tree-height
    |=  total-txs=@ud
    ^-  @ud
    ?<  =(0 total-txs)
    =/  het  0
    |-
    =/  wid  (calc-tree-width het total-txs)
    ?:  =(1 wid)  het
    %=  $
        het  +(het)
    ==
  ::
  ++  calc-tree-width
    |=  [height=@ud total-txs=@ud]
    ^-  @ud
    %+  rsh  [0 height]
    %+  add  total-txs
    %+  sub  (lsh [0 height] 1)
        1
  ::
  --
::
++  on-block-headers  ((on block-height block-header) lth)
::
--

