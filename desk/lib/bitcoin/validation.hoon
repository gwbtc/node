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
    $%  [%valid =block-hash =block-height =chainwork]
        [%invalid =block-hash =validation-checks]
        [%redundant =block-hash]
        [%orphan =block-hash]
    ==
  +$  validation-checks
    $:  valid-prev-hash=_|
        valid-work-required=_|
        valid-time-lower-bound=_|
        valid-time-upper-bound=_|
        valid-pow=_|
    ==
  ::
  ++  validate-block-header
    |=  hed=block-header
    ^-  validation-result
    =,  params
    ?:  =(0x0 previous-block-hash.hed)
      %-  validate-genesis-block-header
          hed
    =/  this-hash  (make-block-hash:b-ser hed)
    ?:  (~(has by hes) this-hash)
      :-  %redundant
          this-hash
    =/  previous  (~(get by hes) previous-block-hash.hed)
    ?~  previous
      :-  %orphan
          this-hash
    =*  pre  u.previous
    =/  het  +(block-height.pre)
    |^
    =/  prev-hash           (make-block-hash:b-ser block-header.pre)
    =/  block-time          (from-unix:chrono:userlib time.hed)
    =/  median-time-past    get-median-time-past
    =/  target              (de-compact-target:b-ser bits.hed)
    =/  next-work-required  get-next-work-required
    =/  val
      %*  p
          p=*validation-checks
          valid-prev-hash         =(prev-hash previous-block-hash.hed)
          valid-work-required     =(bits.hed next-work-required)
          valid-time-lower-bound  (gth block-time median-time-past)
          valid-time-upper-bound  (lte block-time (add now max-future-block-time))
          valid-pow               (lte this-hash target)
      ==
    ?:  ?&  valid-prev-hash.val
            valid-work-required.val
            valid-time-lower-bound.val
            valid-time-upper-bound.val
            valid-pow.val
        ==
      :^  %valid
          this-hash
          het
          (calc-new-chainwork target chainwork.pre)
    :+  %invalid
        this-hash
        val
    ::
    ++  get-median-time-past
      ^-  @da
      =/  lis
        =/  num  past-median-timespan
        |-
        ^-  (list @ud)
        ?:  =(0 num)  ~
        ?:  =(0 het)  ~
        =:  num  (dec num)
            het  (dec het)
            hed  block-header:(~(got by hes) previous-block-hash.hed)
          ==
        :-  time.hed
            $
      %-  from-unix:chrono:userlib
      %+  snag
          (div (lent lis) 2)
          (sort lis lth)
    ::
    ++  get-next-work-required
      ^-  @ux
      ?.  =(0 (mod het difficulty-adjustment-interval))  bits.block-header.pre
      =/  epoch-first
        ^-  block-header
        =/  num  difficulty-adjustment-interval
        |-
        ?:  =(0 num)  hed
        ?:  =(0 het)  hed
        %=  $
            num  (dec num)
            het  (dec het)
            hed  block-header:(~(got by hes) previous-block-hash.hed)
        ==
      =/  actual-timespan
        %+  sub
        %-  from-unix:chrono:userlib  time.block-header.pre
        %-  from-unix:chrono:userlib  time.epoch-first
      =.  actual-timespan  (max actual-timespan (div pow-target-timespan 4))
      =.  actual-timespan  (min actual-timespan (mul pow-target-timespan 4))
      =/  previous-target  (de-compact-target:b-ser bits.block-header.pre)
      =/  next-target
        %+  min
            pow-limit
            (div (mul previous-target actual-timespan) pow-target-timespan)
      %-  en-compact-target:b-ser
          next-target
    ::
    --
  ::
  ++  validate-genesis-block-header
    |=  hed=block-header
    ^-  validation-result
    =/  gen       genesis-block-header
    =/  gen-hash  (make-block-hash:b-ser gen)
    =/  hed-hash  (make-block-hash:b-ser hed)
    ?:  (~(has by hes) hed-hash)
      :-  %redundant
          hed-hash
    ?:  =(hed gen)
      :^  %valid
          hed-hash
          0
          (calc-new-chainwork (de-compact-target:b-ser bits.hed) 0x0)
    :+  %invalid
        hed-hash
    %*  p
        p=*validation-checks
        valid-prev-hash         =(previous-block-hash.hed previous-block-hash.gen)
        valid-work-required     =(bits.hed bits.gen)
        valid-time-lower-bound  =(time.hed time.gen)
        valid-time-upper-bound  =(time.hed time.gen)
        valid-pow               =(hed-hash gen-hash)
    ==
  ::
  ++  calc-new-chainwork
    |=  [tar=@ux wok=chainwork]
    ^-  chainwork
    %+  add  wok
    %+  div
        (pow 2 256)
        +(tar)
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
      |=  f=flag
      ?!  f
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
    %+  shay  32
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
    =.  flags.acc  (snoc flags.acc parent-of-match)
    ?:  ?|  =(0 het)
            !parent-of-match
        ==
      %_  acc
          hashes  (snoc hashes.acc calc-hash)
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
      %+  shay  32
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
--

