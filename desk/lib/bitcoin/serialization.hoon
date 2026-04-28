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
:: +bo
::   serialized (little endian) block parsing core
++  bo
  |_  [dum=hexb leb=@ux]
  ++  bo-core  .
  ++  bo-abed  |=(bok=@ux bo-core(leb bok))
  ++  bo-peek  |=(wid=@ud (end [3 wid] leb))
  ++  bo-skip  |=(wid=@ud bo-core(leb (rsh [3 wid] leb)))
  ++  bo-dump  [dum bo-core(dum *hexb)]
  ++  bo-read
    |=  wid=@ud
    =/  dat  (end [3 wid] leb)
    :-  dat
    %_  bo-core
      dum  [(add wid.dum wid) (can 3 [dum wid^dat ~])]
      leb  (rsh [3 wid] leb)
    ==
  ::
  ++  parse-compact-size
    ^-  [@ud _bo-core]
    =^  prefix  bo-core  (bo-read 1)
    ?:  (lte prefix 0xfc)  [prefix bo-core]
    ?:  =(prefix 0xfd)  (bo-read 2)
    ?:  =(prefix 0xfe)  (bo-read 4)
    ?:  =(prefix 0xff)  (bo-read 8)
    ~|  %invalid-compactsize
    !!
  ::
  ++  parse-block-header
    ^-  [[=block-hash block-header] _bo-core]
    =^  version      bo-core  (bo-read 4)
    =^  prev-hash    bo-core  (bo-read 32)
    =^  merkle-root  bo-core  (bo-read 32)
    =^  time         bo-core  (bo-read 4)
    =^  bits         bo-core  (bo-read 4)
    =^  nonce        bo-core  (bo-read 4)
    =^  bh-bytes     bo-core  bo-dump
    :_  bo-core
    :-  (shay 32 (shay bh-bytes))
    :*  version
        prev-hash
        merkle-root
        time
        bits
        nonce
    ==
  ::
  ++  parse-transaction-count
    ^-  [@ud _bo-core]
    =^  tx-n  bo-core  parse-compact-size
    =^  dum   bo-core  bo-dump
    :-  tx-n
        bo-core
  ::
  ++  parse-transaction
    ^-  [[=txid transaction] _bo-core]
    =^  version  bo-core  (bo-read 4)
    =/  is-segwit  =(0x100 (bo-peek 2))
    =?  bo-core  is-segwit  (bo-skip 2)
    =^  input-n  bo-core  parse-compact-size
    =^  inputs   bo-core
      =/  ins  *(list transaction-input)
      |-
      ?:  =(0 input-n)  [(flop ins) bo-core]
      =^  in-txid          bo-core  (bo-read 32)
      =^  in-vout          bo-core  (bo-read 4)
      =^  script-sig-size  bo-core  parse-compact-size
      =^  in-script-sig    bo-core  (bo-read script-sig-size)
      =^  in-sequence      bo-core  (bo-read 4)
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
    =^  output-n  bo-core  parse-compact-size
    =^  outputs   bo-core
      =/  ous  *(list transaction-output)
      |-
      ?:  =(0 output-n)  [(flop ous) bo-core]
      =^  ou-amount           bo-core  (bo-read 8)
      =^  script-pubkey-size  bo-core  parse-compact-size
      =^  ou-script-pubkey    bo-core  (bo-read script-pubkey-size)
      %=  $
        output-n  (dec output-n)
        ous
          :_  ous
          :*  ou-amount
              [script-pubkey-size ou-script-pubkey]
          ==
      ==
    =^  tx-bytes-incomplete  bo-core  bo-dump
    =^  witness  bo-core
      ^-  [transaction-witness _bo-core]
      ?.  is-segwit  [~ bo-core]
      =/  wis  *transaction-witness
      |-
      ?:  =(0 input-n)  [(flop wis) bo-core]
      =^  stack-n  bo-core  parse-compact-size
      =^  stack    bo-core
        ^-  [witness-stack _bo-core]
        =/  sak  *witness-stack
        |-
        ?:  =(0 stack-n)  [(flop sak) bo-core]
        =^  item-size  bo-core  parse-compact-size
        =^  item       bo-core  (bo-read item-size)
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
    =^  witness-bytes  bo-core  bo-dump
    =^  locktime       bo-core  (bo-read 4)
    =^  tx-bytes-rest  bo-core  bo-dump
    =/  txid
      %+  shay  32
      %+  shay
          (add wid.tx-bytes-incomplete wid.tx-bytes-rest)
          (can 3 [tx-bytes-incomplete tx-bytes-rest ~])
    :_  bo-core
    :-  txid
    :*  version
        locktime
        inputs
        outputs
    ==
  ::
  --
::
--

