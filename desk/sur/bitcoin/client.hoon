/-  *bitcoin-common,
    b-net=bitcoin-network
|%
::
+$  config
  $:  verb=?
      target-addresses=@ud
      target-peers=@ud
      target-priority-peers=@ud
      minimum-peer-protocol-version=@ud
      required-peer-services=services:b-net
      priority-peer-base-ping-average=@dr
      priority-peer-minimum-uptime=@dr
      peer-handshake-timeout=@dr
      ping-interval=@dr
      pending-req-retry-interval=@dr
      header-sync-retry-interval=@dr
      tx-inv-broadcast-retry-interval=@dr
      tx-broadcast-cache-expiration=@dr
      blacklist-cleanup-interval=@dr
      filter-cache-max-size=@ud
      block-cache-max-size=@ud
      percent-of-cache-size-to-prune=@ud
  ==
::
+$  bitcoin-client-action
  $%  [%broadcast-transaction p=broadcast-transaction:action]
      [%connect-peer p=connect-peer:action]
      [%disconnect-peer p=disconnect-peer:action]
      [%add-address p=add-address:action]
      [%del-address p=del-address:action]
      [%configure p=configure:action]
  ==
::
+$  bitcoin-client-update
  $%  [%is-synced p=is-synced:update]
      [%best-block p=best-block:update]
      [%best-filter-header p=best-filter-header:update]
      [%block-header-by-hash p=block-header-by-hash:update]
      [%block-header-by-height p=block-header-by-height:update]
      [%filter-header-by-hash p=filter-header-by-hash:update]
      [%filter-header-by-height p=filter-header-by-height:update]
      [%block-filter-by-hash p=block-filter-by-hash:update]
      [%block-filter-by-height p=block-filter-by-height:update]
      [%block-by-hash p=block-by-hash:update]
      [%block-by-height p=block-by-height:update]
      [%transaction p=transaction:update]
      [%peers p=peers:update]
      [%addresses p=addresses:update]
      [%blacklist p=blacklist:update]
      [%config p=config:update]
  ==
::
++  action
  |%
  ::
  +$  broadcast-transaction  transaction
  +$  connect-peer           earth-address
  +$  disconnect-peer        earth-address
  +$  add-address            earth-address
  +$  del-address            earth-address
  +$  configure              (list config-action)
  ::
  --
::
+$  config-action
  $%  [%verb p=?]
      [%target-addresses p=@ud]
      [%target-peers p=@ud]
      [%target-priority-peers p=@ud]
  ==
::
++  update
  |%
  +$  config  ^config
  ::
  +$  is-synced  ?
  ::
  +$  best-block
    $%  [%new =block-height =block-hash]
    $:  %reorg-rollback
        last-common=[=block-height =block-hash]
        stale-branch=(list [=block-height =block-hash])
    ==  ==
  +$  best-filter-header  [=block-height =block-hash]
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
  +$  filter-header-by-hash
    $@  ~
        @ux
  +$  filter-header-by-height
    @ux
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
  +$  addresses
    $%  [%all addresses=earth-addresses]
        [%put address=earth-address info=earth-address-info]
        [%del address=earth-address]
    ==
  ::
  +$  blacklist
    $%  [%all blacklist=earth-blacklist]
        [%put address=earth-address info=earth-blacklist-info]
        [%del address=earth-address]
    ==
  ::
  --
::
+$  earth-addresses
  %+  map
      earth-address
      earth-address-info
+$  earth-address
  $:  net-id=network-address-id:b-net
      address=@ux
      port=@ud
  ==
+$  earth-address-info
  $:  =address-provenance
      =address-rank
      =last-heard
      =services:b-net
  ==
+$  earth-peer-info
  $:  handshake-done=_|
      wtxidrelay=_|
      =services:b-net
      connection-opened=time
      =last-heard
      =ping-average
  ==
+$  earth-blacklist
  %+  map
      earth-address
      earth-blacklist-info
+$  earth-blacklist-info
  $:  when=time
      reason=@t
      expiration=(unit @dr)
  ==
+$  address-rank
  $~  %unknown
  $?  %priority
      %known
      %unknown
  ==
+$  address-provenance
  $%  [%userspace ~]
      [%network who=earth-address]
  ==
+$  last-heard    (unit time)
+$  ping-average  (unit @dr)
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
--

