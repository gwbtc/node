/-  *bitcoin-client,
    b-net=bitcoin-network
|_  upd=bitcoin-client-update
::
++  grab
  |%
  ++  noun  bitcoin-client-update
  --
++  grow
  |%
  ++  noun  upd
  ++  json
    ^-  ^json
    ?-  -.upd
        %is-synced
      (tagged 'is-synced' [%b p.upd])
        %best-block
      (tagged 'best-block' (best-block-json p.upd))
        %block-header-by-hash
      (tagged 'block-header-by-hash' (block-header-by-hash-json p.upd))
        %block-header-by-height
      (tagged 'block-header-by-height' (block-header-json p.upd))
        %block-filter-by-hash
      (tagged 'block-filter-by-hash' (block-filter-by-hash-json p.upd))
        %block-filter-by-height
      (tagged 'block-filter-by-height' (block-filter-json p.upd))
        %block-by-hash
      (tagged 'block-by-hash' (block-by-hash-json p.upd))
        %block-by-height
      (tagged 'block-by-height' (block-update-json p.upd))
        %transaction
      (tagged 'transaction' (transaction-update-json p.upd))
        %peers
      (tagged 'peers' (peers-json p.upd))
        %addresses
      (tagged 'addresses' (addresses-json p.upd))
        %blacklist
      (tagged 'blacklist' (blacklist-json p.upd))
    ==
  --
++  grad  %noun
::
++  object
  |=  fields=(list [@t ^json])
  ^-  ^json
  [%o (~(gas by *(map @t ^json)) fields)]
::
++  tagged
  |=  [tag=@t val=^json]
  ^-  ^json
  (object [[tag val] ~])
::
++  decimal
  |=  num=@ud
  ^-  ^json
  [%n (crip ((d-co:co 1) num))]
::
++  hex
  |=  [wid=@ud dat=@ux]
  ^-  ^json
  [%s (en:base16:mimes:html wid dat)]
::
++  en-earth-time
  |=  tim=time
  ^-  @ud
  %+  div
      (sub tim ~1970.1.1)
      ~s1
::
++  en-earth-duration-milliseconds
  |=  dur=@dr
  ^-  @ud
  (div dur (div ~s1 1.000))
::
++  best-block-json
  |=  bes=best-block:update
  ^-  ^json
  ?-  -.bes
      %new
    (block-height-hash-json block-height.bes block-hash.bes)
      %reorg-rollback
    %-  object
    :~  ['last-common' (block-height-hash-json -.last-common.bes +.last-common.bes)]
        ['stale-branch' [%a (turn stale-branch.bes block-height-hash-json)]]
    ==
  ==
::
++  block-height-hash-json
  |=  [height=@ud hash=@ux]
  ^-  ^json
  %-  object
  :~  ['block-height' (decimal height)]
      ['block-hash' (hex 32 hash)]
  ==
::
++  block-info-json
  |=  inf=block-info
  ^-  ^json
  %-  object
  :~  ['block-height' (decimal block-height.inf)]
      ['block-hash' (hex 32 block-hash.inf)]
      ['confirmations' ?~(confirmations.inf ~ (decimal u.confirmations.inf))]
      ['next-block-hash' ?~(next-block-hash.inf ~ (hex 32 u.next-block-hash.inf))]
      ['chainwork' (hex 32 chainwork.inf)]
  ==
::
++  block-header-by-hash-json
  |=  dat=block-header-by-hash:update
  ^-  ^json
  ?~  dat  ~
  (block-header-json dat)
::
++  block-header-json
  |=  dat=block-header-by-height:update
  ^-  ^json
  %-  object
  :~  ['block-info' (block-info-json -.dat)]
      ['block-header' (block-header-data-json block-header.dat)]
  ==
::
++  block-header-data-json
  |=  hed=block-header
  ^-  ^json
  %-  object
  :~  ['version' (hex 4 version.hed)]
      ['previous-block-hash' (hex 32 previous-block-hash.hed)]
      ['merkle-root' (hex 32 merkle-root.hed)]
      ['time' (decimal time.hed)]
      ['bits' (hex 4 bits.hed)]
      ['nonce' (hex 4 nonce.hed)]
  ==
::
++  block-filter-by-hash-json
  |=  dat=block-filter-by-hash:update
  ^-  ^json
  ?~  dat  ~
  (block-filter-json dat)
::
++  block-filter-json
  |=  dat=block-filter-by-height:update
  ^-  ^json
  %-  object
  :~  ['block-info' (block-info-json -.dat)]
      ['filter' (hex wid.filter.dat dat.filter.dat)]
  ==
::
++  block-by-hash-json
  |=  dat=block-by-hash:update
  ^-  ^json
  ?~  dat  ~
  (block-update-json dat)
::
++  block-update-json
  |=  dat=block-by-height:update
  ^-  ^json
  %-  object
  :~  ['block-info' (block-info-json -.dat)]
      ['block' (block-json block.dat)]
  ==
::
++  block-json
  |=  bok=block
  ^-  ^json
  %-  object
  :~  ['block-header' (block-header-data-json -.bok)]
      ['txs' [%a (turn txs.bok transaction-json)]]
  ==
::
++  transaction-update-json
  |=  dat=transaction:update
  ^-  ^json
  ?~  dat  ~
  %-  object
  :~  ['block-info' (block-info-json -.dat)]
      ['index' (decimal index.dat)]
      ['txid' (hex 32 txid.dat)]
      ['wtxid' (hex 32 wtxid.dat)]
      ['transaction' (transaction-json transaction.dat)]
  ==
::
++  transaction-json
  |=  txn=transaction
  ^-  ^json
  %-  object
  :~  ['version' (hex 4 version.txn)]
      ['flag' (decimal flag.txn)]
      ['inputs' [%a (turn inputs.txn transaction-input-json)]]
      ['outputs' [%a (turn outputs.txn transaction-output-json)]]
      ['locktime' (decimal locktime.txn)]
  ==
::
++  transaction-input-json
  |=  inp=transaction-input
  ^-  ^json
  %-  object
  :~  ['txid' (hex 32 txid.inp)]
      ['vout' (decimal vout.inp)]
      ['script-sig' (hexb-json script-sig.inp)]
      ['sequence' (hex 4 sequence.inp)]
      ['witness' [%a (turn witness.inp hexb-json)]]
  ==
::
++  transaction-output-json
  |=  out=transaction-output
  ^-  ^json
  %-  object
  :~  ['value' (decimal value.out)]
      ['script-pubkey' (hexb-json script-pubkey.out)]
  ==
::
++  hexb-json
  |=  byt=hexb
  ^-  ^json
  (hex wid.byt dat.byt)
::
++  network-address-id-json
  |=  nid=network-address-id:b-net
  ^-  ^json
  ?-  nid
      %ipv4       [%s 'ipv4']
      %ipv6       [%s 'ipv6']
      %torv2      [%s 'torv2']
      %torv3      [%s 'torv3']
      %i2p        [%s 'i2p']
      %cjdns      [%s 'cjdns']
      %yggdrasil  [%s 'yggdrasil']
  ==
::
++  network-address-width
  |=  nid=network-address-id:b-net
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
++  earth-address-json
  |=  adr=earth-address
  ^-  ^json
  %-  object
  :~  ['network-id' (network-address-id-json net-id.adr)]
      ['address' (hex (network-address-width net-id.adr) address.adr)]
      ['port' (decimal port.adr)]
  ==
::
++  services-json
  |=  ser=services:b-net
  ^-  ^json
  %-  object
  :~  ['node-network' [%b node-network.ser]]
      ['node-bloom' [%b node-bloom.ser]]
      ['node-witness' [%b node-witness.ser]]
      ['node-compact-filters' [%b node-compact-filters.ser]]
      ['node-network-limited' [%b node-network-limited.ser]]
      ['node-p2p-v2' [%b node-p2p-v2.ser]]
  ==
::
++  peers-json
  |=  dat=peers:update
  ^-  ^json
  ?-  -.dat
      %all
    %-  object
    :~  ['type' [%s 'all']]
        ['peers' [%a (turn ~(tap by peers.dat) peer-json)]]
    ==
      %put
    %-  object
    :~  ['type' [%s 'put']]
        ['address' (earth-address-json address.dat)]
        ['info' (earth-peer-info-json info.dat)]
    ==
      %del
    %-  object
    :~  ['type' [%s 'del']]
        ['address' (earth-address-json address.dat)]
    ==
  ==
::
++  earth-peer-info-json
  |=  inf=earth-peer-info
  ^-  ^json
  =/  lat
    ?~  last-heard.inf  ~
    (decimal (en-earth-time u.last-heard.inf))
  =/  pig
    ?~  ping-average.inf  ~
    (decimal (en-earth-duration-milliseconds u.ping-average.inf))
  %-  object
  :~  ['handshake-done' [%b handshake-done.inf]]
      ['wtxidrelay' [%b wtxidrelay.inf]]
      ['services' (services-json services.inf)]
      ['connection-opened' (decimal (en-earth-time connection-opened.inf))]
      ['last-heard' lat]
      ['ping-average' pig]
  ==
::
++  peer-json
  |=  [adr=earth-address inf=earth-peer-info]
  ^-  ^json
  %-  object
  :~  ['address' (earth-address-json adr)]
      ['info' (earth-peer-info-json inf)]
  ==
::
++  addresses-json
  |=  dat=addresses:update
  ^-  ^json
  ?-  -.dat
      %all
    %-  object
    :~  ['type' [%s 'all']]
        ['addresses' [%a (turn ~(tap by addresses.dat) address-json)]]
    ==
      %put
    %-  object
    :~  ['type' [%s 'put']]
        ['address' (earth-address-json address.dat)]
        ['info' (earth-address-info-json info.dat)]
    ==
      %del
    %-  object
    :~  ['type' [%s 'del']]
        ['address' (earth-address-json address.dat)]
    ==
  ==
::
++  address-rank-json
  |=  rak=address-rank
  ^-  ^json
  ?-  rak
      %priority  [%s 'priority']
      %known     [%s 'known']
      %unknown   [%s 'unknown']
  ==
::
++  address-provenance-json
  |=  pro=address-provenance
  ^-  ^json
  ?-  -.pro
      %userspace
    %-  object
    :~  ['type' [%s 'userspace']]
    ==
      %network
    %-  object
    :~  ['type' [%s 'network']]
        ['who' (earth-address-json who.pro)]
    ==
  ==
::
++  earth-address-info-json
  |=  inf=earth-address-info
  ^-  ^json
  =/  lat
    ?~  last-heard.inf  ~
    (decimal (en-earth-time u.last-heard.inf))
  %-  object
  :~  ['address-provenance' (address-provenance-json address-provenance.inf)]
      ['address-rank' (address-rank-json address-rank.inf)]
      ['last-heard' lat]
      ['services' (services-json services.inf)]
  ==
::
++  address-json
  |=  [adr=earth-address inf=earth-address-info]
  ^-  ^json
  %-  object
  :~  ['address' (earth-address-json adr)]
      ['info' (earth-address-info-json inf)]
  ==
::
++  blacklist-json
  |=  dat=blacklist:update
  ^-  ^json
  ?-  -.dat
      %all
    %-  object
    :~  ['type' [%s 'all']]
        ['blacklist' [%a (turn ~(tap by blacklist.dat) blacklist-entry-json)]]
    ==
      %put
    %-  object
    :~  ['type' [%s 'put']]
        ['address' (earth-address-json address.dat)]
        ['info' (earth-blacklist-info-json info.dat)]
    ==
      %del
    %-  object
    :~  ['type' [%s 'del']]
        ['address' (earth-address-json address.dat)]
    ==
  ==
::
++  earth-blacklist-info-json
  |=  inf=earth-blacklist-info
  ^-  ^json
  =/  exp
    ?~  expiration.inf  ~
    (decimal (en-earth-duration-milliseconds u.expiration.inf))
  %-  object
  :~  ['when' (decimal (en-earth-time when.inf))]
      ['reason' [%s reason.inf]]
      ['expiration' exp]
  ==
::
++  blacklist-entry-json
  |=  [adr=earth-address inf=earth-blacklist-info]
  ^-  ^json
  %-  object
  :~  ['address' (earth-address-json adr)]
      ['info' (earth-blacklist-info-json inf)]
  ==
--
