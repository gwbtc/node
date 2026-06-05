/-  *bitcoin-common,
    network=bitcoin-network
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
    =.  en-core  (en-transaction i.txs.bok)
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
  ++  en-transaction
    |=  txn=transaction
    ?+  flag.txn
            (en-segwit-transaction txn)
        %0  (en-legacy-transaction txn)
    ==
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
  ++  en-network-magic-bytes
    |=  net=network:network
    %+  en-prep    4
    ?-  net
        %mainnet   0xd9b4.bef9
        %testnet   0xdab5.bffa
        %testnet3  0x709.110b
        %testnet4  0x283f.161c
        %signet    0x40cf.030a
    ==
  ::
  ++  en-network-address-id
    |=  nid=address-network-id:network
    %+  en-prep     1
    ?-  nid
        %ipv4       0x1
        %ipv6       0x2
        %torv2      0x3
        %torv3      0x4
        %i2p        0x5
        %cjdns      0x6
        %yggdrasil  0x7
    ==
  ::
  ++  en-network-services
    |=  ser=services:network
    %+  en-prep  8
    %+  con  (lsh [0 0] !node-network.ser)
    %+  con  (lsh [0 2] !node-bloom.ser)
    %+  con  (lsh [0 3] !node-witness.ser)
    %+  con  (lsh [0 6] !node-compact-filters.ser)
    %+  con  (lsh [0 10] !node-network-limited.ser)
    %+  con  (lsh [0 11] !node-p2p-v2.ser)
    0
  ::
  ++  en-network-address-v1-partial
    |=  adr=address-v1-partial:network
    =.  en-core  (en-network-services services.adr)
    =.  en-core  (en-prep 16 ip.adr)
    =.  en-core  (en-prep 2 port.adr)
        en-core
  ::
  ++  en-network-address-v1
    |=  adr=address-v1:network
    =.  en-core  (en-prep 4 time.adr)
    %-  en-network-address-v1-partial
        +.adr
  ::
  ++  en-network-address-v2
    |=  adr=address-v2:network
    =.  en-core  (en-prep 4 time.adr)
    =.  en-core  (en-compactsize dat:en-abet:(en-network-services:en services.adr))
    =.  en-core  (en-network-address-id id.adr)
    =.  en-core  (en-prep address.adr)
    =.  en-core  (en-prep 2 port.adr)
        en-core
  ::
  ++  en-network-block-locator
    |=  loc=block-locator:network
    =.  en-core  (en-prep 4 protocol-version.loc)
    =.  en-core  (en-compactsize (lent locator.loc))
    |-
    ?~  locator.loc  en-core
    =.  en-core  (en-prep 32 i.locator.loc)
    %=  $
        locator.loc  t.locator.loc
    ==
  ::
  ++  en-network-inventory
    |=  inv=inventory:network
    =/  witness-flag  msg-witness-flag:network
    =.  en-core  (en-compactsize (lent inv))
    |^
    ?~  inv  en-core
    =.  en-core  (en-prep 4 (inv-type-to-num type.i.inv))
    =.  en-core  (en-prep 32 hash.i.inv)
    %=  $
        inv  t.inv
    ==
    ++  inv-type-to-num
      |=  typ=inventory-type:network
      ^-  @ud
      ?-  typ
          %undefined           0
          %msg-tx              1
          %msg-block           2
          %msg-wtx             5
          %msg-filtered-block  3
          %msg-cmpct-block     4
          %msg-witness-block   (con (inv-type-to-num %msg-block) witness-flag)
          %msg-witness-tx      (con (inv-type-to-num %msg-tx) witness-flag)
      ==
    --
  ::
  ++  en-network-message
    |=  [net=network:network msg=message:network]
    =/  payload  en-abet:(en-network-message-payload:en msg)
    =.  en-core  (en-network-magic-bytes net)
    =.  en-core  (en-prep 12 -.msg)
    =.  en-core  (en-prep 4 wid.payload)
    =.  en-core  (en-prep 4 (end [3 4] (shay 32 (shay payload))))
    =.  en-core  (en-prep payload)
        en-core
  ::
  ++  en-network-message-payload
    |=  msg=message:network
    ^+  en-core
    ?-  -.msg
    ::
        %version
      =.  en-core  (en-prep 4 version.msg)
      =.  en-core  (en-network-services services.msg)
      =.  en-core  (en-prep 8 time.msg)
      =.  en-core  (en-network-address-v1-partial receiver.msg)
      =.  en-core  (en-network-address-v1-partial sender.msg)
      =.  en-core  (en-prep 8 nonce.msg)
      =/  txt-len  (met 3 user-agent.msg)
      =.  en-core  (en-compactsize txt-len)
      =.  en-core  (en-prep txt-len user-agent.msg)
      =.  en-core  (en-prep 4 starting-height.msg)
      =.  en-core  (en-prep 1 !relay.msg)
          en-core
    ::
        %verack       en-core
        %wtxidrelay   en-core
        %sendaddrv2   en-core
        %sendheaders  en-core
    ::
        %sendtxrcncl
      =.  en-core  (en-prep 4 version.msg)
      =.  en-core  (en-prep 8 remote-salt.msg)
          en-core
    ::
        %sendcmpct
      =.  en-core  (en-prep 1 !receiver-is-high-bandwidth.msg)
      =.  en-core  (en-prep 8 version.msg)
          en-core
    ::
        %addr
      =.  en-core  (en-compactsize (lent addresses.msg))
      |-
      ?~  addresses.msg  en-core
      =.  en-core  (en-network-address-v1 i.addresses.msg)
      %=  $
          addresses.msg  t.addresses.msg
      ==
    ::
        %addrv2
      =.  en-core  (en-compactsize (lent addresses.msg))
      |-
      ?~  addresses.msg  en-core
      =.  en-core  (en-network-address-v2 i.addresses.msg)
      %=  $
          addresses.msg  t.addresses.msg
      ==
    ::
        %ping      (en-prep 8 nonce.msg)
        %pong      (en-prep 8 nonce.msg)
        %inv       (en-network-inventory inventory.msg)
        %getdata   (en-network-inventory inventory.msg)
        %notfound  (en-network-inventory inventory.msg)
    ::
        %getblocks
      =.  en-core  (en-network-block-locator block-locator.msg)
      =.  en-core  (en-prep 32 ?^(hash-stop.msg u.hash-stop.msg 0x0))
          en-core
    ::
        %getheaders
      =.  en-core  (en-network-block-locator block-locator.msg)
      =.  en-core  (en-prep 32 ?^(hash-stop.msg u.hash-stop.msg 0x0))
          en-core
    ::
        %getblocktxn
      =.  en-core  (en-prep 32 block-hash.msg)
      =.  en-core  (en-compactsize (lent differential-indexes.msg))
      |-
      ?~  differential-indexes.msg  en-core
      =.  en-core  (en-compactsize i.differential-indexes.msg)
      %=  $
          differential-indexes.msg  t.differential-indexes.msg
      ==
    ::
        %getaddr  en-core
        %mempool  en-core
        %tx       (en-transaction transaction.msg)
        %block    (en-block block.msg)
    ::
        %headers
      =.  en-core  (en-compactsize (lent headers.msg))
      |-
      ?~  headers.msg  en-core
      =.  en-core  (en-block-header i.headers.msg)
      %=  $
          headers.msg  t.headers.msg
      ==
    ::
        %merkleblock  en-core  :: TODO: merkle block serialization
    ::
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
  :: ++  de-network-message
  ::   ?-  -.msg
  ::   ::
  ::       %version
  ::   ::
  ::       %verack
  ::   ::
  ::       %wtxidrelay
  ::   ::
  ::       %sendaddrv2
  ::   ::
  ::       %sendheaders
  ::   ::
  ::       %sendtxrcncl
  ::   ::
  ::       %sendcmpct
  ::   ::
  ::       %addr
  ::   ::
  ::       %addrv2
  ::   ::
  ::       %ping
  ::   ::
  ::       %pong
  ::   ::
  ::       %inv
  ::   ::
  ::       %getdata
  ::   ::
  ::       %notfound
  ::   ::
  ::       %getblocks
  ::   ::
  ::       %getheaders
  ::   ::
  ::       %getblocktxn
  ::   ::
  ::       %getaddr
  ::   ::
  ::       %mempool
  ::   ::
  ::       %tx
  ::   ::
  ::       %block
  ::   ::
  ::       %headers
  ::   ::
  ::       %merkleblock
  ::   ::
  ::   ==
  ::
  --
::
--

