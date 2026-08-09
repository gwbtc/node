/-  *bitcoin-common,
    b-net=bitcoin-network
|%
::
+$  earth-addresses
  %+  map
      earth-address
  $:  =last-heard
      =services:b-net
  ==
+$  earth-address
  $:  net-id=network-address-id:b-net
      address=@ux
      port=@ud
  ==
+$  blacklist  (map earth-address time)
::
+$  earth-peer-info
  $:  handshake-done=_|
      wtxidrelay=_|
      =services:b-net
      =last-heard
  ==
+$  last-heard  (unit time)
::
+$  confirmations  (unit @ud)
::
+$  next-block-hash  (unit block-hash)
::
+$  block-info
  $:  =block-hash
      =block-height
      =confirmations
      =next-block-hash
      =chainwork
  ==
::
++  update
  |%
  ::
  +$  is-synced  ?
  ::
  +$  best-block
    $%  [%new =block-height =block-hash]
        [%reorg-rollback =block-height =block-hash]
    ==
  ::
  +$  block-header-by-hash
    $@  ~
    $:  block-info
        =block-header
    ==
  +$  block-header-by-height
    $:  block-info
        =block-header
    ==
  ::
  +$  block-filter-by-hash
    $@  ~
    $:  block-info
        filter=hexb
    ==
  ::
  +$  block-filter-by-height
    $:  block-info
        filter=hexb
    ==
  ::
  +$  block-by-hash
    $@  ~
    $:  block-info
        =block
    ==
  ::
  +$  block-by-height
    $:  block-info
        =block
    ==
  ::
  +$  transaction
    $@  ~
    $:  block-info
        index=@ud
        =txid
        =wtxid
        =^transaction
    ==
  ::
  +$  peers
    $%  [%all peers=(map earth-address earth-peer-info)]
        [%put address=earth-address info=earth-peer-info]
        [%del address=earth-address]
    ==
  ::
  --
::
--

