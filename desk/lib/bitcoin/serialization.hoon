/-  *bitcoin-common
|%
::
++  make-block-hash
  |=  hed=block-header
  ^-  block-hash
  %+  shay  32
  %-  shay
      en-abet:(en-block-header:en hed)
::
++  make-txid
  |=  txn=transaction
  ^-  txid
  %+  shay  32
  %-  shay
      en-abet:(en-legacy-transaction:en txn)
::
++  de-compact-target
  |=  bis=@ux
  ^-  @ux
  =/  siz  (rsh [3 3] bis)
  =/  wod  (dis bis 0x7f.ffff)
  %+  lsh  [3 (sub siz 3)]
      wod
::
++  en-compact-target
  |=  tar=@ux
  ^-  @ux
  =/  siz  (met 3 tar)
  =/  sig  ?:((lte siz 3) tar (rsh [3 (sub siz 3)] tar))
  =/  sin  (rsh [0 23] sig)
  =?  siz  =(1 sin)  +(siz)
  =?  sig  =(1 sin)  (rsh [3 1] sig)
  ?>  (lte (met 3 siz) 1)
  %+  can  3
  :~  3^sig
      1^siz
  ==
::
:: +en
::   serialization core
++  en
  |_  byt=hexb
  ++  en-core  .
  ++  en-abet  byt
  ++  en-prep
    |=  [wid=@ dat=@]
    %_  en-core
        wid.byt  (add wid.byt wid)
        dat.byt  (can 3 [byt wid^dat ~])
    ==
  ::
  ++  en-compactsize
    |=  aum=@
    ^+  en-core
    ?:  (lte aum 0xfc)  (en-prep 1 aum)
    =/  len  (met 3 aum)
    ?:  (lte len 2)  (en-prep 1 0xfd):(en-prep 2 (rev 3 2^aum))
    ?:  (lte len 4)  (en-prep 1 0xfe):(en-prep 4 (rev 3 4^aum))
    ?:  (lte len 8)  (en-prep 1 0xff):(en-prep 8 (rev 3 8^aum))
    ~|  %invalid-compactsize
    !!
  ::
  ++  en-block
    |=  bok=block
    ^+  en-core
    =.  en-core  (en-block-header -.bok)
    =.  en-core  (en-compactsize (lent txs.bok))
    |-
    ?~  txs.bok  en-core
    =.  en-core
      ?+  flag.i.txs.bok
              (en-segwit-transaction i.txs.bok)
          %0  (en-legacy-transaction i.txs.bok)
      ==
    %=  $
        txs.bok  t.txs.bok
    ==
  ::
  ++  en-block-header
    |=  hed=block-header
    =.  en-core  (en-prep 4 version.hed)
    =.  en-core  (en-prep 32 previous-block-hash.hed)
    =.  en-core  (en-prep 32 merkle-root.hed)
    =.  en-core  (en-prep 4 time.hed)
    =.  en-core  (en-prep 4 bits.hed)
    =.  en-core  (en-prep 4 nonce.hed)
        en-core
  ::
  ++  en-legacy-transaction
    |=  txn=transaction
    =.  en-core  (en-prep 4 version.txn)
    =.  en-core  (en-transaction-inputs inputs.txn)
    =.  en-core  (en-transaction-outputs outputs.txn)
    =.  en-core  (en-prep 4 locktime.txn)
        en-core
  ::
  ++  en-segwit-transaction
    |=  txn=transaction
    =.  en-core  (en-prep 4 version.txn)
    =.  en-core  (en-prep 1 0x0)
    =.  en-core  (en-prep 1 flag.txn)
    =.  en-core  (en-transaction-inputs inputs.txn)
    =.  en-core  (en-transaction-outputs outputs.txn)
    =.  en-core  (en-transaction-witness inputs.txn)
    =.  en-core  (en-prep 4 locktime.txn)
        en-core
  ::
  ++  en-transaction-inputs
    |=  ins=(list transaction-input)
    =.  en-core  (en-compactsize (lent ins))
    |-
    ?~  ins  en-core
    =.  en-core  (en-transaction-input i.ins)
    %=  $
        ins  t.ins
    ==
  ::
  ++  en-transaction-input
    |=  inp=transaction-input
    =.  en-core  (en-prep 32 txid.inp)
    =.  en-core  (en-prep 4 vout.inp)
    =.  en-core  (en-compactsize wid.script-sig.inp)
    =.  en-core  (en-prep script-sig.inp)
    =.  en-core  (en-prep 4 sequence.inp)
        en-core
  ::
  ++  en-transaction-outputs
    |=  ous=(list transaction-output)
    =.  en-core  (en-compactsize (lent ous))
    |-
    ?~  ous  en-core
    =.  en-core  (en-transaction-output i.ous)
    %=  $
        ous  t.ous
    ==
  ::
  ++  en-transaction-output
    |=  out=transaction-output
    =.  en-core  (en-prep 8 value.out)
    =.  en-core  (en-compactsize wid.script-pubkey.out)
    =.  en-core  (en-prep script-pubkey.out)
        en-core
  ::
  ++  en-transaction-witness
    |=  ins=(list transaction-input)
    ?~  ins  en-core
    =*  wit  witness.i.ins
    =.  en-core  (en-compactsize (lent wit))
    =.  en-core
      |-
      ?~  wit  en-core
      =.  en-core  (en-compactsize wid.i.wit)
      =.  en-core  (en-prep i.wit)
      %=  $
          wit  t.wit
      ==
    %=  $
        ins  t.ins
    ==
  ::
  --
::
:: +de
::   deserialization core
++  de
  |_  dat=@ux
  ++  de-core  .
  ++  de-abed  |=(leb=@ux de-core(dat leb))
  ++  de-read  |=(wid=@ud [(end [3 wid] dat) de-core(dat (rsh [3 wid] dat))])
  ++  de-peek  |=(wid=@ud (end [3 wid] dat))
  ::
  ++  de-compactsize
    ^-  [@ud _de-core]
    =^  prefix  de-core  (de-read 1)
    ?:  (lte prefix 0xfc)  [prefix de-core]
    ?:  =(prefix 0xfd)  (de-read 2)
    ?:  =(prefix 0xfe)  (de-read 4)
    ?:  =(prefix 0xff)  (de-read 8)
    ~|  %invalid-compactsize
    !!
  ::
  ++  de-block
    ^-  [block _de-core]
    =^  block-header  de-core  de-block-header
    =^  tx-count      de-core  de-compactsize
    =^  transactions  de-core
      =/  txs  *(list transaction)
      |-
      ?:  =(0 tx-count)  [(flop txs) de-core]
      =^  txn  de-core  de-transaction
      %=  $
          tx-count  (dec tx-count)
          txs       [txn txs]
      ==
    :_  de-core
    :*  block-header
        transactions
    ==
  ::
  ++  de-block-header
    ^-  [block-header _de-core]
    =^  version      de-core  (de-read 4)
    =^  prev-hash    de-core  (de-read 32)
    =^  merkle-root  de-core  (de-read 32)
    =^  time         de-core  (de-read 4)
    =^  bits         de-core  (de-read 4)
    =^  nonce        de-core  (de-read 4)
    :_  de-core
    :*  version
        prev-hash
        merkle-root
        time
        bits
        nonce
    ==
  ::
  ++  de-transaction
    ^-  [transaction _de-core]
    =^  version  de-core  (de-read 4)
    =/  is-segwit  =(0x0 (de-peek 1))
    =^  tx-flag  de-core
      ?.  is-segwit  [0 de-core]
      =^  marker  de-core  (de-read 1)
      %-  de-read  1
    =^  input-n  de-core  de-compactsize
    =^  inputs   de-core
      =/  ins  *(list transaction-input)
      |-
      ?:  =(0 input-n)  [(flop ins) de-core]
      =^  in-txid          de-core  (de-read 32)
      =^  in-vout          de-core  (de-read 4)
      =^  script-sig-size  de-core  de-compactsize
      =^  in-script-sig    de-core  (de-read script-sig-size)
      =^  in-sequence      de-core  (de-read 4)
      %=  $
          input-n  (dec input-n)
          ins
            :_  ins
            :*  in-txid
                in-vout
                [script-sig-size in-script-sig]
                in-sequence
                ~
            ==
      ==
    =^  output-n  de-core  de-compactsize
    =^  outputs   de-core
      =/  ous  *(list transaction-output)
      |-
      ?:  =(0 output-n)  [(flop ous) de-core]
      =^  ou-amount           de-core  (de-read 8)
      =^  script-pubkey-size  de-core  de-compactsize
      =^  ou-script-pubkey    de-core  (de-read script-pubkey-size)
      %=  $
          output-n  (dec output-n)
          ous
            :_  ous
            :*  ou-amount
                [script-pubkey-size ou-script-pubkey]
            ==
      ==
    =^  witness  de-core
      ^-  [transaction-witness _de-core]
      ?.  is-segwit  [~ de-core]
      =/  wis  *transaction-witness
      |-
      ?:  =(0 input-n)  [(flop wis) de-core]
      =^  stack-n  de-core  de-compactsize
      =^  stack    de-core
        ^-  [witness-stack _de-core]
        =/  sak  *witness-stack
        |-
        ?:  =(0 stack-n)  [(flop sak) de-core]
        =^  item-size  de-core  de-compactsize
        =^  item       de-core  (de-read item-size)
        %=  $
            stack-n  (dec stack-n)
            sak      [[item-size item] sak]
        ==
      %=  $
          input-n  (dec input-n)
          wis      [stack wis]
      ==
    =?  inputs  is-segwit
      =<  p
      %^  spin  inputs  witness
      |=  [inp=transaction-input wit=transaction-witness]
      ?>  ?=(^ wit)
      :_  t.wit
      %_  inp
          witness  i.wit
      ==
    =^  locktime  de-core  (de-read 4)
    :_  de-core
    :*  version
        tx-flag
        inputs
        outputs
        locktime
    ==
  ::
  ++  de-merkle-block
    ^-  [merkle-block _de-core]
    =^  block-header         de-core  de-block-header
    =^  partial-merkle-tree  de-core  de-partial-merkle-tree
    :_  de-core
    :*  block-header
        partial-merkle-tree
    ==
  ::
  ++  de-partial-merkle-tree
    ^-  [partial-merkle-tree _de-core]
    =^  tx-count      de-core  (de-read 4)
    =^  hash-count    de-core  de-compactsize
    =^  hashes  de-core
      =/  haz  *(list @ux)
      |-
      ?:  =(0 hash-count)  [(flop haz) de-core]
      =^  hiz  de-core  (de-read 32)
      %=  $
          hash-count  (dec hash-count)
          haz         [hiz haz]
      ==
    =^  flag-count  de-core  de-compactsize
    =^  flags  de-core
      =/  faz  *(list (list flag))
      |-
      ?:  =(0 flag-count)  [(zing (flop faz)) de-core]
      =^  biz  de-core  (de-read 1)
      =/  fiz
        %^  spin  (rip [0 1] biz)  0
        |=  [n=@ a=@]
        :-  !(? n)
            +(a)
      =/  pad  (reap (sub 8 q.fiz) |)
      %=  $
          flag-count  (dec flag-count)
          faz         [(weld p.fiz pad) faz]
      ==
    :_  de-core
    :*  tx-count
        hashes
        flags
    ==
  ::
  --
::
--

