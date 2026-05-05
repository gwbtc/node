/-  *bitcoin-common
|%
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
++  en-compactsize
  |=  aum=@
  ^-  hexb
  ?:  (lte aum 0xfc)  1^aum
  =/  len  (met 3 aum)
  ?:  (lte len 2)  3^(can 3 ~[2^(rev 3 2^aum) 1^0xfd])
  ?:  (lte len 4)  5^(can 3 ~[4^(rev 3 4^aum) 1^0xfe])
  ?:  (lte len 8)  9^(can 3 ~[8^(rev 3 8^aum) 1^0xff])
  ~|  %invalid-compactsize
  !!
::
:: +de
::   deserialization core (little endian)
++  de
  |_  dat=@ux
  ++  de-core  .
  ++  de-abed  |=(leb=@ux de-core(dat leb))
  ++  de-read  |=(wid=@ud [(end [3 wid] dat) de-core(dat (rsh [3 wid] dat))])
  ++  de-peek  |=(wid=@ud (end [3 wid] dat))
  ++  de-skip  |=(wid=@ud de-core(dat (rsh [3 wid] dat)))
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
    =/  is-segwit  =(0x100 (de-peek 2))
    =?  de-core  is-segwit  (de-skip 2)
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
        locktime
        inputs
        outputs
    ==
  ::
  ++  de-merkle-block
    ^-  [merkle-block _de-core]
    =^  block-header  de-core  de-block-header
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
      ?:  =(0 flag-count)  [(flop `(list flag)`(zing faz)) de-core]
      =^  fiz  de-core  (de-read 1)
      %=  $
          flag-count  (dec flag-count)
          faz         [((list flag) (rip [0 1] fiz)) faz]
      ==
    :_  de-core
    :*  block-header
        hashes
        flags
    ==
  ::
  --
::
--

