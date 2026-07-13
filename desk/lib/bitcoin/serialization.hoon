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
++  make-wtxid
  |=  txn=transaction
  ^-  txid
  %+  shay  32
  %-  shay
      en-abet:(en-transaction:en txn)
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
    |=  [wid=@ dat=@]  :: TODO: validate atom dat size is lte wid?
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
    ?:  (lte len 2)  =.(en-core (en-prep 1 0xfd) (en-prep 2 aum))
    ?:  (lte len 4)  =.(en-core (en-prep 1 0xfe) (en-prep 4 aum))
    ?:  (lte len 8)  =.(en-core (en-prep 1 0xff) (en-prep 8 aum))
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
    |=  nid=network-address-id:network
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
    =.  en-core  (en-prep 16 (rev 3 16 ip.adr))
    =.  en-core  (en-prep 2 (rev 3 2 port.adr))
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
    =/  siz      (address-id-to-size:network-helpers id.adr)
    =.  en-core  (en-compactsize siz)
    =.  en-core  (en-prep siz (rev 3 siz address.adr))
    =.  en-core  (en-prep 2 (rev 3 2 port.adr))
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
    =.  en-core  (en-compactsize (lent inv))
    |-
    ?~  inv  en-core
    =.  en-core  (en-prep 4 (inv-type-to-num:network-helpers type.i.inv))
    =.  en-core  (en-prep 32 hash.i.inv)
    %=  $
        inv  t.inv
    ==
  ::
  ++  en-network-message
    |=  [net=network:network msg=message:network]
    =/  payload  en-abet:(en-network-message-payload:en msg)
    =.  en-core  (en-network-magic-bytes net)
    =.  en-core  (en-prep 12 -.msg)
    =.  en-core  (en-prep 4 wid.payload)
    =.  en-core  (en-prep (make-message-checksum:network-helpers payload))
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
      =.  en-core  (en-prep 1 !high-bandwidth-mode.msg)
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
        %tx       (en-transaction transaction.msg)
        %block    (en-block block.msg)
    ::
        %headers
      =.  en-core  (en-compactsize (lent headers.msg))
      |-
      ?~  headers.msg  en-core
      =.  en-core  (en-block-header i.headers.msg)
      =.  en-core  (en-prep 1 0x0)
      %=  $
          headers.msg  t.headers.msg
      ==
    ::
        %feefilter  (en-prep 8 amount.msg)
    ::
        %cmpctblock
      =.  en-core  (en-block-header block-header.msg)
      =.  en-core  (en-prep 8 nonce.msg)
      =.  en-core  (en-compactsize (lent shortids.msg))
      =.  en-core
        |-
        ?~  shortids.msg  en-core
        =.  en-core  (en-prep 6 i.shortids.msg)
        %=  $
            shortids.msg  t.shortids.msg
        ==
      =.  en-core  (en-compactsize (lent prefilledtxn.msg))
      |-
      ?~  prefilledtxn.msg  en-core
      =.  en-core  (en-compactsize differential-index.i.prefilledtxn.msg)
      =.  en-core  (en-transaction transaction.i.prefilledtxn.msg)
      %=  $
          prefilledtxn.msg  t.prefilledtxn.msg
      ==
    ::
        %blocktxn
      =.  en-core  (en-prep 32 block-hash.msg)
      =.  en-core  (en-compactsize (lent transactions.msg))
      |-
      ?~  transactions.msg  en-core
      =.  en-core  (en-transaction i.transactions.msg)
      %=  $
          transactions.msg  t.transactions.msg
      ==
    ::
        %getcfilters
      =.  en-core  (en-prep 1 filter-type.msg)
      =.  en-core  (en-prep 4 start-height.msg)
      =.  en-core  (en-prep 32 stop-hash.msg)
          en-core
    ::
        %cfilter
      =.  en-core  (en-prep 1 filter-type.msg)
      =.  en-core  (en-prep 32 block-hash.msg)
      =.  en-core  (en-compactsize wid.filter.msg)
      =.  en-core  (en-prep filter.msg)
          en-core
    ::
        %getcfheaders
      =.  en-core  (en-prep 1 filter-type.msg)
      =.  en-core  (en-prep 4 start-height.msg)
      =.  en-core  (en-prep 32 stop-hash.msg)
          en-core
    ::
        %cfheaders
      =.  en-core  (en-prep 1 filter-type.msg)
      =.  en-core  (en-prep 32 stop-hash.msg)
      =.  en-core  (en-prep 32 previous-filter-header.msg)
      =.  en-core  (en-compactsize (lent filter-hashes.msg))
      |-
      ?~  filter-hashes.msg  en-core
      =.  en-core  (en-prep 32 i.filter-hashes.msg)
      %=  $
          filter-hashes.msg  t.filter-hashes.msg
      ==
    ::
        %getcfcheckpt
      =.  en-core  (en-prep 1 filter-type.msg)
      =.  en-core  (en-prep 32 stop-hash.msg)
          en-core
    ::
        %cfcheckpt
      =.  en-core  (en-prep 1 filter-type.msg)
      =.  en-core  (en-prep 32 stop-hash.msg)
      =.  en-core  (en-compactsize (lent filter-headers.msg))
      |-
      ?~  filter-headers.msg  en-core
      =.  en-core  (en-prep 32 i.filter-headers.msg)
      %=  $
          filter-headers.msg  t.filter-headers.msg
      ==
    ::
    ==
  ::
  --
::
:: +de
::   deserialization core
++  de
  |_  byt=hexb
  ++  de-core  .
  ++  de-abet  byt
  ++  de-abed  |=(leb=hexb de-core(byt leb))
  ++  de-peek  |=(wid=@ud (end [3 wid] dat.byt))
  ++  de-read
    |=  wid=@ud
    :-  (de-peek wid)
    %_  de-core
        wid.byt  ?:((lth wid wid.byt) (sub wid.byt wid) 0)
        dat.byt  (rsh [3 wid] dat.byt)
    ==
  ::
  ++  de-compactsize
    ^-  [@ _de-core]
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
  ++  de-network-magic-bytes
    ^-  [(unit network:network) _de-core]
    =^  magic  de-core  (de-read 4)
    :_  de-core
    ?+  magic          ~
        %0xd9b4.bef9   ~^%mainnet
        %0xdab5.bffa   ~^%testnet
        %0x709.110b    ~^%testnet3
        %0x283f.161c   ~^%testnet4
        %0x40cf.030a   ~^%signet
    ==
  ::
  ++  de-network-address-id
    ^-  [network-address-id:network _de-core]
    =^  net-id  de-core  (de-read 1)
    :_  de-core
    ?+  net-id  !!
        %0x1  %ipv4
        %0x2  %ipv6
        %0x3  %torv2
        %0x4  %torv3
        %0x5  %i2p
        %0x6  %cjdns
        %0x7  %yggdrasil
    ==
  ::
  ++  de-network-services
    ^-  [services:network _de-core]
    =^  ser-bits  de-core  (de-read 8)
    :_  de-core
    %-  parse-service-bits:network-helpers
        ser-bits
  ::
  ++  de-network-address-v1-partial
    ^-  [address-v1-partial:network _de-core]
    =^  services  de-core  de-network-services
    =^  ip        de-core  (de-read 16)
    =^  port      de-core  (de-read 2)
    :_  de-core
    :*  services
        (rev 3 16 ip)
        (rev 3 2 port)
    ==
  ::
  ++  de-network-address-v1
    ^-  [address-v1:network _de-core]
    =^  time  de-core  (de-read 4)
    =^  addr  de-core  de-network-address-v1-partial
    :_  de-core
    :*  time
        addr
    ==
  ::
  ++  de-network-address-v2
    ^-  [address-v2:network _de-core]
    =^  time      de-core  (de-read 4)
    =^  ser-bits  de-core  de-compactsize
    =^  addr-id   de-core  de-network-address-id
    =^  siz       de-core  de-compactsize
    =^  address   de-core  (de-read siz)
    =^  port      de-core  (de-read 2)
    :_  de-core
    :*  time
        (parse-service-bits:network-helpers ser-bits)
        addr-id
        (rev 3 siz address)
        (rev 3 2 port)
    ==
  ::
  ++  de-network-block-locator
    ^-  [block-locator:network _de-core]
    =^  version  de-core  (de-read 4)
    =^  count    de-core  de-compactsize
    =^  locator  de-core
      =/  haz  *(list block-hash)
      |-
      ?:  =(0 count)  [(flop haz) de-core]
      =^  hiz  de-core  (de-read 32)
      %=  $
          count  (dec count)
          haz    [hiz haz]
      ==
    :_  de-core
    :*  version
        locator
    ==
  ::
  ++  de-network-inventory
    ^-  [inventory:network _de-core]
    =^  count  de-core  de-compactsize
    =/  inv  *inventory:network
    |-
    ?:  =(0 count)  [(flop inv) de-core]
    =^  inv-num  de-core  (de-read 4)
    =^  hash     de-core  (de-read 32)
    %=  $
        count  (dec count)
        inv    [[(inv-num-to-type:network-helpers inv-num) hash] inv]
    ==
  ::
  ++  de-network-message-header
    ^-  [network-message-header _de-core]
    =^  network       de-core  de-network-magic-bytes:de-core
    =^  command       de-core  (de-read 12)
    =^  payload-size  de-core  (de-read 4)
    =^  checksum      de-core  (de-read 4)
    :_  de-core
    :*  (need network)
        command
        payload-size
        checksum
    ==
  ::
  ++  de-network-message
    ^-  [$@(~ [=network:network =message:network]) _de-core]
    =^  hed  de-core  de-network-message-header:de-core
    =*  nek  network.hed
    =*  siz  payload-size.hed
    =*  typ  command.hed
    ?+  typ  ~^+:(de-read:de-core siz)  :: TODO: virtualize the payload deserialization and produce null + consume payload bytes on crash
    ::
        %version
      =^  version   de-core  (de-read 4)
      =^  services  de-core  de-network-services
      =^  time      de-core  (de-read 8)
      =^  receiver  de-core  de-network-address-v1-partial
      =^  sender    de-core  de-network-address-v1-partial
      =^  nonce     de-core  (de-read 8)
      =^  user-len  de-core  de-compactsize
      =^  user      de-core  (de-read user-len)
      =^  height    de-core  (de-read 4)
      =^  relay     de-core  (de-read 1)
      :_  de-core
      :*  nek
          typ
          version
          services
          time
          receiver
          sender
          nonce
          user
          height
          !(? relay)
      ==
    ::
        %verack       [[nek typ ~] de-core]
        %wtxidrelay   [[nek typ ~] de-core]
        %sendaddrv2   [[nek typ ~] de-core]
        %sendheaders  [[nek typ ~] de-core]
    ::
        %sendtxrcncl
      =^  version   de-core  (de-read 4)
      =^  salt      de-core  (de-read 8)
      :_  de-core
      :*  nek
          typ
          version
          salt
      ==
    ::
        %sendcmpct
      =^  hb-mode  de-core  (de-read 1)
      =^  version  de-core  (de-read 8)
      :_  de-core
      :*  nek
          typ
          !(? hb-mode)
          version
      ==
    ::
        %addr
      =^  count  de-core  de-compactsize
      =^  addrs  de-core
        =/  ads  *(list address-v1:network)
        |-
        ?:  =(0 count)  [(flop ads) de-core]
        =^  adr  de-core  de-network-address-v1
        %=  $
            count  (dec count)
            ads    [adr ads]
        ==
      :_  de-core
      :*  nek
          typ
          addrs
      ==
    ::
        %addrv2
      =^  count  de-core  de-compactsize
      =^  addrs  de-core
        =/  ads  *(list address-v2:network)
        |-
        ?:  =(0 count)  [(flop ads) de-core]
        =^  adr  de-core  de-network-address-v2
        %=  $
            count  (dec count)
            ads    [adr ads]
        ==
      :_  de-core
      :*  nek
          typ
          addrs
      ==
    ::
        %ping
      =^  nonce  de-core  (de-read 8)
      :_  de-core
      :*  nek
          typ
          nonce
      ==
    ::
        %pong
      =^  nonce  de-core  (de-read 8)
      :_  de-core
      :*  nek
          typ
          nonce
      ==
    ::
        %inv
      =^  inv  de-core  de-network-inventory
      :_  de-core
      :*  nek
          typ
          inv
      ==
    ::
        %getdata
      =^  inv  de-core  de-network-inventory
      :_  de-core
      :*  nek
          typ
          inv
      ==
    ::
        %notfound
      =^  inv  de-core  de-network-inventory
      :_  de-core
      :*  nek
          typ
          inv
      ==
    ::
        %getblocks
      =^  locator  de-core  de-network-block-locator
      =^  hash     de-core  (de-read 32)
      =/  stop     ?:(=(0 hash) ~ [~ hash])
      :_  de-core
      :*  nek
          typ
          locator
          stop
      ==
    ::
        %getheaders
      =^  locator  de-core  de-network-block-locator
      =^  hash     de-core  (de-read 32)
      =/  stop     ?:(=(0 hash) ~ [~ hash])
      :_  de-core
      :*  nek
          typ
          locator
          stop
      ==
    ::
        %getblocktxn
      =^  block-hash  de-core  (de-read 32)
      =^  count       de-core  de-compactsize
      =^  indexes  de-core
        =/  ins  *(list @ud)
        |-
        ?:  =(0 count)  [(flop ins) de-core]
        =^  ind  de-core  de-compactsize
        %=  $
            count  (dec count)
            ins    [ind ins]
        ==
      :_  de-core
      :*  nek
          typ
          block-hash
          indexes
      ==
    ::
        %getaddr  [[nek typ ~] de-core]
    ::
        %tx
      =^  txn  de-core  de-transaction
      :_  de-core
      :*  nek
          typ
          txn
      ==
    ::
        %block
      =^  block  de-core  de-block
      :_  de-core
      :*  nek
          typ
          block
      ==
    ::
        %headers
      =^  count  de-core  de-compactsize
      =^  headers  de-core
        =/  hes  *(list block-header)
        |-
        ?:  =(0 count)  [(flop hes) de-core]
        =^  hed  de-core  de-block-header
        =^  nul  de-core  (de-read 1)
        %=  $
            count  (dec count)
            hes    [hed hes]
        ==
      :_  de-core
      :*  nek
          typ
          headers
      ==
    ::
        %feefilter
      =^  amount  de-core  (de-read 8)
      :_  de-core
      :*  nek
          typ
          amount
      ==
    ::
        %cmpctblock
      =^  header      de-core  de-block-header
      =^  nonce       de-core  (de-read 8)
      =^  n-shortids  de-core  de-compactsize
      =^  shortids    de-core
        =/  sis  *(list @ux)
        |-
        ?:  =(0 n-shortids)  [(flop sis) de-core]
        =^  sid  de-core  (de-read 6)
        %=  $
            n-shortids  (dec n-shortids)
            sis         [sid sis]
        ==
      =^  n-prefilledtxn  de-core  de-compactsize
      =^  prefilledtxn    de-core
        =/  pxs  *(list [@ud transaction])
        |-
        ?:  =(0 n-prefilledtxn)  [(flop pxs) de-core]
        =^  dix  de-core  de-compactsize
        =^  txn  de-core  de-transaction
        %=  $
            n-prefilledtxn  (dec n-prefilledtxn)
            pxs             [[dix txn] pxs]
        ==
      :_  de-core
      :*  nek
          typ
          header
          nonce
          shortids
          prefilledtxn
      ==
    ::
        %blocktxn
      =^  block-hash  de-core  (de-read 32)
      =^  n-txs       de-core  de-compactsize
      =^  txs         de-core
        =/  txs  *(list transaction)
        |-
        ?:  =(0 n-txs)  [(flop txs) de-core]
        =^  txn  de-core  de-transaction
        %=  $
            n-txs  (dec n-txs)
            txs    [txn txs]
        ==
      :_  de-core
      :*  nek
          typ
          block-hash
          txs
      ==
    ::
        %getcfilters
      =^  filter-type   de-core  (de-read 1)
      =^  start-height  de-core  (de-read 4)
      =^  stop-hash     de-core  (de-read 32)
      :_  de-core
      :*  nek
          typ
          filter-type
          start-height
          stop-hash
      ==
    ::
        %cfilter
      =^  filter-type   de-core  (de-read 1)
      =^  block-hash    de-core  (de-read 32)
      =^  filter-size   de-core  de-compactsize
      =^  filter        de-core  (de-read filter-size)
      :_  de-core
      :*  nek
          typ
          filter-type
          block-hash
          [filter-size filter]
      ==
    ::
        %getcfheaders
      =^  filter-type   de-core  (de-read 1)
      =^  start-height  de-core  (de-read 4)
      =^  stop-hash     de-core  (de-read 32)
      :_  de-core
      :*  nek
          typ
          filter-type
          start-height
          stop-hash
      ==
    ::
        %cfheaders
      =^  filter-type   de-core  (de-read 1)
      =^  stop-hash     de-core  (de-read 32)
      =^  prev-head     de-core  (de-read 32)
      =^  n-hashes      de-core  de-compactsize
      =^  hashes        de-core
        =/  haz  *(list @ux)
        |-
        ?:  =(0 n-hashes)  [(flop haz) de-core]
        =^  hiz  de-core  (de-read 32)
        %=  $
            n-hashes  (dec n-hashes)
            haz       [hiz haz]
        ==
      :_  de-core
      :*  nek
          typ
          filter-type
          stop-hash
          prev-head
          hashes
      ==
    ::
        %getcfcheckpt
      =^  filter-type   de-core  (de-read 1)
      =^  stop-hash     de-core  (de-read 32)
      :_  de-core
      :*  nek
          typ
          filter-type
          stop-hash
      ==
    ::
        %cfcheckpt
      =^  filter-type   de-core  (de-read 1)
      =^  stop-hash     de-core  (de-read 32)
      =^  n-headers     de-core  de-compactsize
      =^  headers       de-core
        =/  hez  *(list @ux)
        |-
        ?:  =(0 n-headers)  [(flop hez) de-core]
        =^  hiz  de-core  (de-read 32)
        %=  $
            n-headers  (dec n-headers)
            hez        [hiz hez]
        ==
      :_  de-core
      :*  nek
          typ
          filter-type
          stop-hash
          headers
      ==
    ::
    ==
  ::
  --
::
+$  network-message-header
  $:  =network:network
      command=@t
      payload-size=@ud
      checksum=@ux
  ==
::
++  network-params
  |%
  ++  network-message-header-size       24
  ++  network-message-max-payload-size  33.554.432
  ++  max-protocol-message-length       4.000.000
  --
::
++  network-helpers
  |%
  ++  address-id-to-size
    |=  nid=network-address-id:network
    ^-  @ud
    ?-  nid
        %ipv4       4
        %ipv6       16
        %torv2      10
        %torv3      32
        %i2p        32
        %cjdns      16
        %yggdrasil  16
    ==
  ::
  ++  parse-service-bits
    |=  bis=@ux
    %*  p
        p=*services:network
        node-network          !=(0 (dis (lsh [0 0] 1) bis))
        node-bloom            !=(0 (dis (lsh [0 2] 1) bis))
        node-witness          !=(0 (dis (lsh [0 3] 1) bis))
        node-compact-filters  !=(0 (dis (lsh [0 6] 1) bis))
        node-network-limited  !=(0 (dis (lsh [0 10] 1) bis))
        node-p2p-v2           !=(0 (dis (lsh [0 11] 1) bis))
    ==
  ::
  ++  inv-witness-flag  (lsh [0 30] 1)
  ::
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
        %msg-witness-block   (con (inv-type-to-num %msg-block) inv-witness-flag)
        %msg-witness-tx      (con (inv-type-to-num %msg-tx) inv-witness-flag)
    ==
  ::
  ++  inv-num-to-type
    |=  num=@ud
    ^-  inventory-type:network
    ?:  =(0 num)  %undefined
    ?:  =(1 num)  %msg-tx
    ?:  =(2 num)  %msg-block
    ?:  =(5 num)  %msg-wtx
    ?:  =(3 num)  %msg-filtered-block
    ?:  =(4 num)  %msg-cmpct-block
    ?:  =((con (inv-type-to-num %msg-block) inv-witness-flag) num)  %msg-witness-block
    ?:  =((con (inv-type-to-num %msg-tx) inv-witness-flag) num)     %msg-witness-tx
    !!
  ::
  ++  make-message-checksum
    |=  payload=hexb
    ^-  hexb
    :-  4
    %+  end  [3 4]
    %+  shay  32
    %-  shay  payload
  ::
  --
::
:: +ne
::   network socket handler core
++  ne
  |_  net=network:network
  ::
  ++  write
    |=  messages=(list message:network)
    ^-  hexb
    =/  en-core  en
    |-
    ?~  messages  en-abet:en-core
    =.  en-core  (en-network-message:en-core net i.messages)
    %=  $
        messages  t.messages
    ==
  ::
  ++  read
    |=  [new=hexb buffer=hexb]
    ^-  [(list message:network) hexb]
    =,  network-params
    =/  messages  *(list message:network)
    =/  de-core
      %-  de-abed:de
      :-  (add wid.buffer wid.new)
          (can 3 [buffer new ~])
    |^
    ?:  (lth wid:de-abet:de-core network-message-header-size)
      :-  (flop messages)
          de-abet:de-core
    =/  try  try-read
    ?-  try
    ::
        %wait
      :-  (flop messages)
          de-abet:de-core
    ::
        %none
      %=  $
          de-core  +:(de-read:de-core 1)
      ==
    ::
        %good
      =^  mes  de-core  de-network-message:de-core
      ?~  mes  $
      ?.  =(net network.mes)  $
      %=  $
          messages  [message.mes messages]
      ==
    ::
    ==
    ++  try-read
      ^-  ?(%none %wait %good)
      =/  bys  -:de-network-magic-bytes:de-core
      ?~  bys  %none
      =^  hed  de-core  de-network-message-header:de-core
      ?:  (gth payload-size.hed network-message-max-payload-size)  %none
      ?:  (lth wid:de-abet:de-core payload-size.hed)  %wait
      =/  checksum
        %-  make-message-checksum:network-helpers
        :-  payload-size.hed
        %-  de-peek:de-core
            payload-size.hed
      ?.  =(dat.checksum checksum.hed)  %none
      %good
    ::
    --
  ::
  --
::
--

