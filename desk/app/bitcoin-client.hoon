/-  *bitcoin-common,
    *bitcoin-light-client,
    b-net=bitcoin-network
/+  b-val=bitcoin-validation,
    b-ser=bitcoin-serialization,
    b-fil=bitcoin-compact-block-filters
|%
+$  net-params
  $:  target-addresses=@ud
      target-peers=@ud
      minimum-peer-protocol-version=@ud
      required-peer-services=services:b-net
      blacklist-expiration=@dr
      blacklist-interval=@dr
      ping-interval=@dr
      pending-req-retry-interval=@dr
      header-sync-retry-interval=@dr
      tx-inv-broadcast-retry-interval=@dr
      tx-broadcast-cache-expiration=@dr
  ==
+$  earth-addresses
  %+  map
      earth-address
  $:  last-heard=time
      =services:b-net
  ==
+$  earth-address
  $:  net-id=network-address-id:b-net
      address=@ux
      port=@ud
  ==
+$  earth-peers  (map earth-address earth-peer-state)
+$  earth-peer-state
  $:  handshake-done=_|
      wtxidrelay=_|
      starting-height=block-height
      =services:b-net
      last-heard=time
      outbound-ping=(unit [=time nonce=@ux])
      buffer=hexb
  ==
+$  blacklist  (map earth-address time)
::
+$  pending-block-hash-reqs    (jug block-hash pending-block-hash-req)
+$  pending-block-height-reqs  (jug block-height pending-block-height-req)
+$  pending-block-hash-req
  $%  [%block-filter ~]
      [%block ~]
      [%transaction =txid]
  ==
+$  pending-block-height-req
  $%  [%block-header ~]
      [%block-filter ~]
      [%block ~]
  ==
::
+$  header-sync-req
  %-  unit
  $:  who=earth-address
      when=time
      for=?(%filter-header %block-header)
      at=block-hash
  ==
::
+$  tx-inv-broadcast-queue  (list transaction)
+$  tx-broadcast-cache      (map txid transaction)
::
+$  best-block  [=block-hash =block-height =chainwork]
+$  bh-index    ((mop block-height block-hash) lth)
::
+$  best-filter-header  [=block-height =block-hash]
+$  filter-headers      (map block-hash filter-header:b-fil)
+$  filters             (map block-hash filter:b-fil)
::
+$  state-0
  $:  =network:b-net
      =protocol-version:b-net
      =services:b-net
      =net-params
      =earth-peers
      =earth-addresses
      =blacklist
      =pending-block-hash-reqs
      =pending-block-height-reqs
      =header-sync-req
      =tx-inv-broadcast-queue
      =tx-broadcast-cache
      =best-block
      =bh-index
      =best-filter-header
      =filter-headers
      =filters
      =block-headers
  ==
+$  state-n
  $%  [%0 state-0]
  ==
+$  card  card:agent:gall
--
::
=|  $>(%0 state-n)
=*  state  -
=>
::
|_  [=bowl:gall cards=(list card)]
++  cor   .
++  abet  :-  (flop cards)  state
++  emit  |=  =card  cor(cards [card cards])
++  emil  |=  caz=(list card)  cor(cards (welp (flop caz) cards))
::
++  poke
  |=  [mak=mark vaz=vase]
  ^+  cor
  ?>  =(src.bowl our.bowl)
  ?+  mak  ~|(bad-poke/mak !!) 
  ::
      %log-info
    ~&       [%network network]
    ~&       [%services services]
    ~&       [%protocol-version protocol-version]
    ~&       [%net-params net-params]
    ~&  >    [%is-synced is-fully-synced]
    ~&  >    [%best-block best-block]
    ~&  >    [%bh-index ~(wyt in bh-index)]
    ~&  >    [%headers ~(wyt in block-headers)]
    ~&  >>   [%best-filter-header best-filter-header]
    ~&  >>   [%filter-headers ~(wyt in filter-headers)]
    ~&  >>   [%filters ~(wyt in filters)]
    ~&  >>>  [%pending-block-hash-reqs pending-block-hash-reqs]
    ~&  >>>  [%pending-block-height-reqs pending-block-height-reqs]
    ~&  >>>  [%tx-inv-broadcast-queue (lent tx-inv-broadcast-queue)]
    ~&  >>>  [%tx-broadcast-cache ~(wyt in tx-broadcast-cache)]
    ~&   >   [%earth-addresses ~(wyt in earth-addresses)]
    ~&   >   [%blacklist ~(wyt in blacklist)]
    ~&   >   [%total-earth-peers ~(wyt in earth-peers)]
    ~&   >   [%live-earth-peers (lent (skim ~(tap by earth-peers) |=([k=earth-address v=earth-peer-state] handshake-done.v)))]
    cor
  ::
      %broadcast-transaction
    =/  txn  !<(transaction vaz)
    ?:  .?(tx-inv-broadcast-queue)
      %_  cor
          tx-inv-broadcast-queue  (snoc tx-inv-broadcast-queue txn)
      ==
    ?.  have-live-peers
      =.  tx-inv-broadcast-queue  txn^~
      %-  emit
          set-tx-inv-broadcast-queue-timer
    %-  broadcast-tx-inv
        txn
  ::
      %add-earth-peer
    =/  erp  !<(earth-address vaz)
    ?.  |(?=(%ipv4 net-id.erp) ?=(%ipv6 net-id.erp))
      ~&  >>>  [%need-ipv4-or-ipv6 erp]
      !!
    =?  earth-addresses  !(~(has by earth-addresses) erp)
      %+  ~(put by earth-addresses)
          erp
      :*  now.bowl
          *services:b-net
      ==
    ?:  (~(has by earth-peers) erp)
      ~&  >>  [%already-connected erp]
      cor
    %-  connect-to-peer
        erp
  ::
      %kill-peer-connections
    =/  pes  ~(tap by earth-peers)
    |-
    ?~  pes  cor
    =.  cor  (emil (close:tcp p.i.pes))
    %=  $
        pes  t.pes
        earth-peers  (~(del by earth-peers) p.i.pes)
    ==
  ::
  ==
::
++  peek
  |=  poe=(pole @ta)
  ^-  (unit (unit cage))
  ~
::
++  watch
  |=  poe=(pole @ta)
  ^+  cor
  ?>  =(src.bowl our.bowl)
  ?+  poe  !!
  ::
      [%is-synced ~]
    %-  emit
    %~  is-synced  make-update  ~^src.bowl
  ::
      [%best-block ~]
    %-  emit
    %-  ~(best-block make-update ~^src.bowl)
    :+  %new
        block-height.best-block
        block-hash.best-block
  ::
      [%block-header %hash block-hash=@ta ~]
    =/  haz  (slav %ux block-hash.poe)
    =/  dat
      =/  hed  (~(get by block-headers) haz)
      ?~  hed  ~
      ?.  (main-chain-has-hash-at-height haz block-height.u.hed)  ~
      :_  block-header.u.hed
      %:  make-block-info
          block-height.u.hed
          haz
          chainwork.u.hed
      ==
    %-  emil
    %-  ~(res ~(block-header-by-hash make-update ~^src.bowl) haz)
        dat
  ::
      [%block-header %height block-height=@ta ~]
    =/  het  (slav %ud block-height.poe)
    ?:  (lte het block-height.best-block)
      =/  haz  (got:on-bh-index bh-index het)
      =/  hed  (~(got by block-headers) haz)
      %-  emil
      %-  ~(res ~(block-header-by-height make-update ~^src.bowl) het)
      :_  block-header.hed
      %:  make-block-info
          het
          haz
          chainwork.hed
      ==
    =/  req  [%block-header ~]
    ?:  (~(has ju pending-block-height-reqs) het req)  cor
    %_  cor
        pending-block-height-reqs  (~(put ju pending-block-height-reqs) het req)
    ==
  ::
      [%block-filter %hash block-hash=@ta ~]
    =/  haz  (slav %ux block-hash.poe)
    =/  hed  (~(get by block-headers) haz)
    ?~  hed
      %-  emil
      %-  ~(res ~(block-filter-by-hash make-update ~^src.bowl) haz)
          ~
    ?.  (main-chain-has-hash-at-height haz block-height.u.hed)
      %-  emil
      %-  ~(res ~(block-filter-by-hash make-update ~^src.bowl) haz)
          ~
    =/  fil  (~(get by filters) haz)
    ?^  fil
      %-  emil
      %-  ~(res ~(block-filter-by-hash make-update ~^src.bowl) haz)
      :_  u.fil
      %:  make-block-info
          block-height.u.hed
          haz
          chainwork.u.hed
      ==
    =/  req  [%block-filter ~]
    ?:  (~(has ju pending-block-hash-reqs) haz req)  cor
    =.  pending-block-hash-reqs  (~(put ju pending-block-hash-reqs) haz req)
    =.  cor  (emit (set-pending-block-hash-req-timer haz req))
    =/  som  get-some-peer
    ?~  som  cor
    %-  emit
    %+  send:tcp  u.som
    %-  ~(write ne:b-ser network)
    :~  (make-getcfilters-message block-height.u.hed haz)
    ==
  ::
      [%block-filter %height block-height=@ta ~]
    =/  het  (slav %ud block-height.poe)
    ?:  (lte het block-height.best-block)
      =/  haz  (got:on-bh-index bh-index het)
      =/  hed  (~(got by block-headers) haz)
      =/  fil  (~(get by filters) haz)
      ?^  fil
        %-  emil
        %-  ~(res ~(block-filter-by-height make-update ~^src.bowl) het)
        :_  u.fil
        %:  make-block-info
            het
            haz
            chainwork.hed
        ==
      =/  req  [%block-filter ~]
      ?:  (~(has ju pending-block-height-reqs) het req)  cor
      =.  pending-block-height-reqs  (~(put ju pending-block-height-reqs) het req)
      =.  cor  (emit (set-pending-block-height-req-timer het req))
      =/  som  get-some-peer
      ?~  som  cor
      %-  emit
      %+  send:tcp  u.som
      %-  ~(write ne:b-ser network)
      :~  (make-getcfilters-message het haz)
      ==
    =/  req  [%block-filter ~]
    ?:  (~(has ju pending-block-height-reqs) het req)  cor
    %_  cor
        pending-block-height-reqs  (~(put ju pending-block-height-reqs) het req)
    ==
  ::
      [%block %hash block-hash=@ta ~]
    =/  haz  (slav %ux block-hash.poe)
    =/  hed  (~(get by block-headers) haz)
    ?~  hed
      %-  emil
      %-  ~(res ~(block-by-hash make-update ~^src.bowl) haz)
          ~
    ?.  (main-chain-has-hash-at-height haz block-height.u.hed)
      %-  emil
      %-  ~(res ~(block-by-hash make-update ~^src.bowl) haz)
          ~
    :: TODO: check block cache
    =/  req  [%block ~]
    ?:  (~(has ju pending-block-hash-reqs) haz req)  cor
    =.  pending-block-hash-reqs  (~(put ju pending-block-hash-reqs) haz req)
    =.  cor  (emit (set-pending-block-hash-req-timer haz req))
    =/  som  get-some-peer
    ?~  som  cor
    %-  emit
    %+  send:tcp  u.som
    %-  ~(write ne:b-ser network)
    :~  [%getdata [%msg-witness-block haz] ~]
    ==
  ::
      [%block %height block-height=@ta ~]
    =/  het  (slav %ud block-height.poe)
    ?:  (lte het block-height.best-block)
      =/  haz  (got:on-bh-index bh-index het)
      =/  hed  (~(got by block-headers) haz)
      :: TODO: check block cache
      =/  req  [%block ~]
      ?:  (~(has ju pending-block-height-reqs) het req)  cor
      =.  pending-block-height-reqs  (~(put ju pending-block-height-reqs) het req)
      =.  cor  (emit (set-pending-block-height-req-timer het req))
      =/  som  get-some-peer
      ?~  som  cor
      %-  emit
      %+  send:tcp  u.som
      %-  ~(write ne:b-ser network)
      :~  [%getdata [%msg-witness-block haz] ~]
      ==
    =/  req  [%block ~]
    ?:  (~(has ju pending-block-height-reqs) het req)  cor
    %_  cor
        pending-block-height-reqs  (~(put ju pending-block-height-reqs) het req)
    ==
  ::
      [%transaction block-hash=@ta txid=@ta ~]
    =/  haz  (slav %ux block-hash.poe)
    =/  tid  (slav %ux txid.poe)
    =/  hed  (~(get by block-headers) haz)
    ?~  hed
      %-  emil
      %-  ~(res ~(transaction make-update ~^src.bowl) haz tid)
          ~
    ?.  (main-chain-has-hash-at-height haz block-height.u.hed)
      %-  emil
      %-  ~(res ~(transaction make-update ~^src.bowl) haz tid)
          ~
    :: TODO: check block cache
    =/  req  [%transaction tid]
    ?:  (~(has ju pending-block-hash-reqs) haz req)  cor
    =.  pending-block-hash-reqs  (~(put ju pending-block-hash-reqs) haz req)
    =.  cor  (emit (set-pending-block-hash-req-timer haz req))
    =/  som  get-some-peer
    ?~  som  cor
    %-  emit
    %+  send:tcp  u.som
    %-  ~(write ne:b-ser network)
    :~  [%getdata [%msg-witness-block haz] ~]
    ==
  ::
  ==
::
++  leave
  |=  poe=(pole @ta)
  ^+  cor
  :: TODO: clean up pending req state on leave
  cor
::
++  fail
  |=  [tem=term tan=tang]
  ^+  cor
  cor
::
++  arvo
  |=  [wir=(pole @ta) sin=sign-arvo]
  ^+  cor
  ?+  wir  cor
  ::
      [%timer %earth-peer earth-peer=*]
    =/  erp  (de-earth-peer-path earth-peer.wir)
    =/  erd  (~(get by earth-peers) erp)
    ?~  erd  cor
    ?.  ?=([%behn %wake *] sin)  cor
    :: if the previous ping hasn't been answered, disconnect and ban
    ?:  .?(outbound-ping.u.erd)
      %+  disconnect-peer  &  erp  :: TODO: this currently will timeout and ban any peer if the sidecar is disconnected
    =/  nun  (~(rad og eny.bowl) (lsh [3 8] 1))
    =.  outbound-ping.u.erd  [~ now.bowl nun]
    =.  earth-peers  (~(put by earth-peers) erp u.erd)
    %-  emil
    :-  (set-ping-timer erp)
    :_  ~
    %+  send:tcp  erp
    %-  ~(write ne:b-ser network)
    :~  [%ping nun]
    ==
  ::
      [%timer %tx-inv-broadcast-queue ~]
    ?.  have-live-peers
      %-  emit
          set-tx-inv-broadcast-queue-timer
    =/  txs  tx-inv-broadcast-queue
    |-
    ?~  txs
      %_  cor
          tx-inv-broadcast-queue  ~
      ==
    =.  cor  (broadcast-tx-inv i.txs)
    %=  $
        txs  t.txs
    ==
  ::
      [%timer %tx-broadcast-cache txid-or-wtxid=@ta ~]
    =/  tid  (slav %ux txid-or-wtxid.wir)
    %_  cor
        tx-broadcast-cache  (~(del by tx-broadcast-cache) tid)
    ==
  ::
      [%timer %pending-req %block %hash block-hash=@ta ~]
    =/  haz  (slav %ux block-hash.wir)
    :: TODO: make less janky
    ?~  (~(del in (~(get ju pending-block-hash-reqs) haz)) [%block-filter])  cor
    =.  cor  (emit (set-pending-block-hash-req-timer haz [%block ~]))
    =/  som  get-some-peer
    ?~  som  cor
    %-  emit
    %+  send:tcp  u.som
    %-  ~(write ne:b-ser network)
    :~  [%getdata [%msg-witness-block haz] ~]
    ==
  ::
      [%timer %pending-req %block-filter %hash block-hash=@ta ~]
    =/  haz  (slav %ux block-hash.wir)
    =/  hed  (~(got by block-headers) haz)
    =/  req  [%block-filter ~]
    ?.  (~(has ju pending-block-hash-reqs) haz req)  cor
    =.  cor  (emit (set-pending-block-hash-req-timer haz req))
    =/  som  get-some-peer
    ?~  som  cor
    %-  emit
    %+  send:tcp  u.som
    %-  ~(write ne:b-ser network)
    :~  (make-getcfilters-message block-height.hed haz)
    ==
  ::
      [%timer %pending-req %block %height block-height=@ta ~]
    =/  het  (slav %ud block-height.wir)
    =/  haz  (got:on-bh-index bh-index het)
    :: TODO: make less janky
    ?~  (~(del in (~(get ju pending-block-height-reqs) het)) [%block-filter])  cor
    =.  cor  (emit (set-pending-block-height-req-timer het [%block ~]))
    =/  som  get-some-peer
    ?~  som  cor
    %-  emit
    %+  send:tcp  u.som
    %-  ~(write ne:b-ser network)
    :~  [%getdata [%msg-witness-block haz] ~]
    ==
  ::
      [%timer %pending-req %block-filter %height block-height=@ta ~]
    =/  het  (slav %ud block-height.wir)
    =/  haz  (got:on-bh-index bh-index het)
    =/  hed  (~(got by block-headers) haz)
    =/  req  [%block-filter ~]
    ?.  (~(has ju pending-block-height-reqs) het req)  cor
    =.  cor  (emit (set-pending-block-height-req-timer het req))
    =/  som  get-some-peer
    ?~  som  cor
    %-  emit
    %+  send:tcp  u.som
    %-  ~(write ne:b-ser network)
    :~  (make-getcfilters-message het haz)
    ==
  ::
      [%timer %header-sync-retry req-type=@ta hash=@ta earth-peer=*]
    =/  erp  (de-earth-peer-path earth-peer.wir)
    =/  haz  (slav %ux hash.wir)
    =*  for  req-type.wir
    ?:  is-fully-synced  cor
    ?~  header-sync-req  cor
    :: if the latest sync req is different,
    :: then we've already sent a subsequent one
    ?.  ?&  =(erp who.u.header-sync-req)
            =(haz at.u.header-sync-req)
            =(for for.u.header-sync-req)
        ==
        cor
    ~&  %retrying-header-sync
        continue-syncing-headers
  ::
      [%timer %blacklist ~]
    =.  blacklist
      %-  ~(rep by blacklist)
      |=  [[key=earth-address val=time] acc=^blacklist]
      ?:  (gte (sub now.bowl val) blacklist-expiration.net-params)  acc
      %+  ~(put by acc)  key  val
    %-  emit
        set-blacklist-timer
  ::
  ==
::
++  agent
  |=  [wir=(pole @ta) sin=sign:agent:gall]
  ^+  cor
  ?+  wir  cor
  ::
      [%tcp earth-peer=*]
    ?.  ?=(%fact -.sin)  cor
    =/  erp  (de-earth-peer-path earth-peer.wir)
    =/  erd  (~(got by earth-peers) erp)
    =/  gif  !<(gift:tcp q.cage.sin)
    ?-  -.gif
    ::
        %receive
      :: ~&  %tcp-receive
      =.  last-heard.erd  now.bowl
      =^  mes  buffer.erd  (~(read ne:b-ser network) data.gif buffer.erd)
      =.  earth-peers  (~(put by earth-peers) erp erd)
      |-
      ?~  mes  cor
      :: ~&  -.i.mes
      =.  cor  (handle-message [erp erd] i.mes)  :: TODO: virtualize in case of crash
      %=  $
          mes  t.mes
      ==
    ::
        %connected
      ~&  >  [%tcp-connected erp]
      %-  emil
      :_  (set-ping-timer erp)^~
      %+  send:tcp  erp
      %-  ~(write ne:b-ser network)
      :~  make-version-message
      ==
    ::
        %closed
      ~&  >>>  [%tcp-closed erp]
      %+  disconnect-peer  |  erp
    ::
        %error
      ~&  >>>  [%tcp-error erp msg.gif]
      %+  disconnect-peer  &  erp
    ::
    ==
  ::
  ==
::
  ::
::
++  now-t  (scot %da now.bowl)
::
++  on-bh-index  ((on block-height block-hash) lth)
::
++  params
  |%
  ++  max-block-locator-size  101
  --
::
++  have-live-peers
  ^-  ?
  %-  ~(any by earth-peers)
  |=  erd=earth-peer-state
      handshake-done.erd
::
++  is-fully-synced
  ^-  ?
  ?&  block-headers-are-synced
      filter-headers-are-synced
  ==
::
++  block-headers-are-synced
  ^-  ?
  =*  haz  block-hash.best-block
  =*  het  block-height.best-block
  =/  hed  (~(got by block-headers) haz)
  =/  tim  (de-earth-time time.block-header.hed)
  =/  hit  :: TODO: handle the possibility of a peer falsely setting a higher starting-height
    %-  ~(rep by earth-peers)
    |=  [[erp=earth-address erd=earth-peer-state] acc=block-height]
    %+  max
        starting-height.erd
        acc
  ?&  have-live-peers
      (gte tim (sub now.bowl ~d1))
      (gte het hit)
  ==
::
++  filter-headers-are-synced
  ^-  ?
  .=  block-hash.best-block
      block-hash.best-filter-header
::
++  main-chain-has-hash-at-height
  |=  [haz=block-hash het=block-height]
  ^-  ?
  =/  taz  (get:on-bh-index bh-index het)
  ?~  taz  |
  .=  haz
      u.taz
::
++  make-block-info
  |=  [het=block-height haz=block-hash wok=chainwork]
  ^-  block-info
  =/  taz  (get:on-bh-index bh-index het)
  =/  con
    ^-  confirmations
    ?~  taz  ~
    ?.  =(haz u.taz)  ~
    :-  ~
    %+  sub
        +(block-height.best-block)
        het
  =/  nex
    ^-  next-block-hash
    ?~  taz  ~
    ?.  =(haz u.taz)  ~
    %+  get:on-bh-index
        bh-index
        +(het)
  :*  haz
      het
      con
      nex
      wok
  ==
::
++  make-block-locator
  ^-  block-locator:b-net
  :-  protocol-version
  =/  het  block-height.best-block
  =/  len  0
  =/  les  1
  |-
  ^-  (list block-hash)
  ?:  =(len max-block-locator-size:params)  ~
  =/  haz  (get:on-bh-index bh-index het)
  ?~  haz  ~
  :-  u.haz
  =.  len  +(len)
  ?:  =(0 het)  ~
  =?  les  (gte 10 len)  (mul 2 les)
  %=  $
      het  ?:((lth les het) (sub het les) 0)
  ==
::
++  make-update
  |_  for=(unit ship)
  ::
  ++  is-synced
    ^-  card
    =/  dat  `is-synced:update`is-fully-synced
    =/  paf  /is-synced
    %+  fact  paf  [%is-synced !>(dat)]
  ::
  ++  best-block
    |=  dat=best-block:update
    ^-  card
    =/  paf  /best-block
    %+  fact  paf  [%best-block !>(dat)]
  ::
  ++  block-header-by-hash
    |_  haz=block-hash
    ++  sub  /block-header/hash/[(scot %ux haz)]
    ++  end  (kick sub)
    ++  res
      |=  dat=block-header-by-hash:update
      ^-  (list card)
      :~  (fact sub %block-header-by-hash !>(dat))
          end
      ==
    --
  ::
  ++  block-header-by-height
    |_  het=block-height
    ++  sub  /block-header/height/[(scot %ud het)]
    ++  end  (kick sub)
    ++  res
      |=  dat=block-header-by-height:update
      ^-  (list card)
      :~  (fact sub %block-header-by-height !>(dat))
          end
      ==
    --
  ::
  ++  block-filter-by-hash
    |_  haz=block-hash
    ++  sub  /block-filter/hash/[(scot %ux haz)]
    ++  end  (kick sub)
    ++  res
      |=  dat=block-filter-by-hash:update
      ^-  (list card)
      :~  (fact sub %block-filter-by-hash !>(dat))
          end
      ==
    --
  ::
  ++  block-filter-by-height
    |_  het=block-height
    ++  sub  /block-filter/height/[(scot %ud het)]
    ++  end  (kick sub)
    ++  res
      |=  dat=block-filter-by-height:update
      ^-  (list card)
      :~  (fact sub %block-filter-by-height !>(dat))
          end
      ==
    --
  ::
  ++  block-by-hash
    |_  haz=block-hash
    ++  sub  /block/hash/[(scot %ux haz)]
    ++  end  (kick sub)
    ++  res
      |=  dat=block-by-hash:update
      ^-  (list card)
      :~  (fact sub %block-by-hash !>(dat))
          end
      ==
    --
  ::
  ++  block-by-height
    |_  het=block-height
    ++  sub  /block/height/[(scot %ud het)]
    ++  end  (kick sub)
    ++  res
      |=  dat=block-by-height:update
      ^-  (list card)
      :~  (fact sub %block-by-height !>(dat))
          end
      ==
    --
  ::
  ++  transaction
    |_  [haz=block-hash tid=txid]
    ++  sub  /transaction/[(scot %ux haz)]/[(scot %ux tid)]
    ++  end  (kick sub)
    ++  res
      |=  dat=transaction:update
      ^-  (list card)
      :~  (fact sub %transaction !>(dat))
          end
      ==
    --
  ::
  ++  fact  |=([paf=path cag=cage] `card`[%give %fact ?-(for ~ paf^~, ^ ~) cag])
  ++  kick  |=(paf=path `card`[%give %kick paf^~ for])
  ::
  --
::
++  timer
  |_  wir=wire
  ++  set
    |=  dur=@dr
    =/  wen  (add now.bowl dur)
    ^-  card
    :*  %pass  wir  %arvo  %b  %wait  wen
    ==
  ++  end
    |=  wen=time
    ^-  card
    :*  %pass  wir  %arvo  %b  %rest  wen
    ==
  --
::
++  set-ping-timer
  |=  erp=earth-address
  ^-  card
  %.  ping-interval:net-params
  %~  set
      timer
  %+  weld  /timer/earth-peer  (en-earth-peer-path erp)
::
++  set-blacklist-timer
  ^-  card
  %.  blacklist-interval:net-params
  %~  set
      timer
      /timer/blacklist
::
++  set-tx-inv-broadcast-queue-timer
  ^-  card
  %.  tx-inv-broadcast-retry-interval:net-params
  %~  set
      timer
      /timer/tx-inv-broadcast-queue
::
++  set-tx-broadcast-cache-timer
  |=  tid=txid
  ^-  card
  %.  tx-broadcast-cache-expiration:net-params
  %~  set
      timer
      /timer/tx-broadcast-cache/[(scot %ux tid)]
::
++  set-pending-block-hash-req-timer
  |=  [haz=block-hash req=pending-block-hash-req]
  ^-  card
  %.  pending-req-retry-interval:net-params
  %~  set
      timer
  ?+  -.req
    /timer/pending-req/block/hash/[(scot %ux haz)]
      %block-filter
    /timer/pending-req/block-filter/hash/[(scot %ux haz)]
  ==
::
++  set-pending-block-height-req-timer
  |=  [het=block-height req=pending-block-height-req]
  ^-  card
  %.  pending-req-retry-interval:net-params
  %~  set
      timer
  ?+  -.req
    /timer/pending-req/block/height/[(scot %ud het)]
      %block-filter
    /timer/pending-req/block-filter/height/[(scot %ud het)]
  ==
::
++  set-header-sync-retry-timer
  |=  syc=^header-sync-req
  ^-  card
  %.  header-sync-retry-interval:net-params
  %~  set
      timer
  %+  weld
      /timer/header-sync-retry
  %-  en-header-sync-retry-path
      syc
::
++  end-header-sync-retry-timer
  |=  syc=^header-sync-req
  ^-  card
  ?>  ?=(^ syc)
  %.  when.u.syc
  %~  end
      timer
  %+  weld
      /timer/header-sync-retry
  %-  en-header-sync-retry-path
      syc
::
++  en-earth-time
  |=  tim=time
  %+  div
      (sub tim ~1970.1.1)
      ~s1
::
++  de-earth-time
  |=  ert=@ud
  %-  from-unix:chrono:userlib
      ert
::
++  en-header-sync-retry-path
  |=  syc=^header-sync-req
  ^-  path
  ?>  ?=(^ syc)
  %+  weld
      `path`/[for.u.syc]/[(scot %ux at.u.syc)]
  %-  en-earth-peer-path
      who.u.syc
::
++  en-earth-peer-path
  |=  erp=earth-address
  ^-  path
  /[net-id.erp]/[(scot %ux address.erp)]/[(scot %ud port.erp)]
::
++  de-earth-peer-path
  |=  paf=path
  ^-  earth-address
  ?>  ?=([@ @ @ ~] paf)
  :*  (network-address-id:b-net i.paf)
      (slav %ux i.t.paf)
      (slav %ud i.t.t.paf)
  ==
::
++  peer-services-are-sufficient
  |=  ser=services:b-net
  ^-  ?
  =*  req  required-peer-services.net-params
  ?&  ?:(node-network.req node-network.ser &)
      ?:(node-bloom.req node-bloom.ser &)
      ?:(node-witness.req node-witness.ser &)
      ?:(node-compact-filters.req node-compact-filters.ser &)
      ?:(node-network-limited.req node-network-limited.ser &)
      ?:(node-p2p-v2.req node-p2p-v2.ser &)
  ==
::
++  get-n-new-addresses
  |=  num=@ud
  ^-  (list earth-address)
  =/  ads  (~(dif in ~(key by earth-addresses)) ~(key by earth-peers))
  =/  siz  ~(wyt in ads)
  =/  rng  ~(. og eny.bowl)
  |-
  ?:  =(0 siz)  ~
  ?:  =(0 num)  ~
  =^  ind  rng  (rads:rng siz)
  =/  adr  (snag ind ~(tap in ads))
  :-  adr
  %=  $
      num  (dec num)
      siz  (dec siz)
      ads  (~(del in ads) adr)
  ==
::
++  get-some-peer
  ^-  (unit earth-address)
  =/  pes
    %+  skim  ~(tap by earth-peers)
    |=  [erp=earth-address erd=earth-peer-state]
        handshake-done.erd
  =/  siz  (lent pes)
  ?:  =(0 siz)  ~
  =/  ind  (~(rad og eny.bowl) siz)
  :-  ~
  =<  p
  %+  snag
      ind
      pes
::
++  connect-to-peer
  |=  erp=earth-address
  ^+  cor
  ~&  ['connecting to:' erp]
  ?<  (~(has by earth-peers) erp)
  ?>  |(?=(%ipv4 net-id.erp) ?=(%ipv6 net-id.erp))
  =.  earth-peers  (~(put by earth-peers) erp *earth-peer-state)
  %-  emil
  %-  open:tcp
      erp
::
++  connect-to-more-peers
  ^+  cor
  =*  target  target-peers.net-params
  =/  num-peers  ~(wyt in earth-peers)
  ?:  (gte num-peers target)  cor
  =/  ads  (get-n-new-addresses (sub target num-peers))
  |-
  ?~  ads  cor
  =.  cor  (connect-to-peer i.ads)
  %=  $
      ads  t.ads
  ==
::
++  disconnect-peer
  |=  [ban=? erp=earth-address]
  ^+  cor
  =/  was-synced  is-fully-synced
  =/  erd  (~(get by earth-peers) erp)
  ?~  erd  cor
  =.  earth-peers  (~(del by earth-peers) erp)
  =.  cor
    ?-  ban
    ::
        %.y
      %_  cor
          blacklist        (~(put by blacklist) erp now.bowl)
          earth-addresses  (~(del by earth-addresses) erp)
      ==
    ::
        %.n
      =/  dat  [last-heard.u.erd services.u.erd]
      %_  cor
          earth-addresses  (~(put by earth-addresses) erp dat)
      ==
    ::
    ==
  =.  cor  connect-to-more-peers
  ?:  have-live-peers  cor
  ?.  was-synced  cor
  %-  emit
  %~  is-synced  make-update  ~
::
++  make-version-message
  ^-  message:b-net
  :-  %version
  =/  ver  *version-payload:b-net
  %_  ver
      version     protocol-version
      services    services
      time        (en-earth-time now.bowl)
      user-agent  'urbit'
  ==
::
++  make-getcfheaders-message
  ^-  message:b-net
  =/  start  +(block-height.best-filter-header)
  =/  stop
    =/  het  (add start 1.999)
    ?:  (gte het block-height.best-block)  block-hash.best-block
    %+  got:on-bh-index
        bh-index
        het
  [%getcfheaders 0 start stop]
::
++  make-getcfilters-message
  |=  [start=block-height stop=block-hash]
  ^-  message:b-net
  [%getcfilters 0 start stop]
::
++  continue-syncing-headers
  ^+  cor
  =/  som  get-some-peer
  ?~  som  cor
  ?:  block-headers-are-synced
    =.  header-sync-req
      :*  ~
          u.som
          now.bowl
          %filter-header
          block-hash.best-filter-header
      ==
    =.  cor
      %-  emit
      %-  set-header-sync-retry-timer
          header-sync-req
    %-  emit
    %+  send:tcp  u.som
    %-  ~(write ne:b-ser network)
    :~  make-getcfheaders-message
    ==
  =.  header-sync-req
    :*  ~
        u.som
        now.bowl
        %block-header
        block-hash.best-block
    ==
  =.  cor
    %-  emit
    %-  set-header-sync-retry-timer
        header-sync-req
  %-  emit
  %+  send:tcp  u.som
  %-  ~(write ne:b-ser network)
  :~  [%getheaders make-block-locator ~]
  ==
::
++  broadcast-tx-inv
  |=  txn=transaction
  ^+  cor
  =/  tid  (make-txid:b-ser txn)
  =/  wid  (make-wtxid:b-ser txn)
  =.  tx-broadcast-cache
    %-  ~(gas by tx-broadcast-cache)
    :~  [tid txn]
        [wid txn]
    ==
  =/  pes
    %+  skim  ~(tap by earth-peers)
    |=  [erp=earth-address erd=earth-peer-state]
        handshake-done.erd
  ?.  .?(pes)  cor
  %-  emil
  :+  (set-tx-broadcast-cache-timer tid)
      (set-tx-broadcast-cache-timer wid)
  %+  turn  pes
  |=  [erp=earth-address erd=earth-peer-state]
  %+  send:tcp  erp
  %-  ~(write ne:b-ser network)
  =/  inv
    ?-  wtxidrelay.erd
        %.y  [%msg-wtx wid]
        %.n  [%msg-tx tid]
    ==
  :~  [%inv inv ~]
  ==
::
++  handle-addrv2
  |=  ads=(list address-v2:b-net)
  ^+  cor
  =.  cor
    |-
    ?~  ads  cor
    =*  adr  i.ads
    =/  erp  [id.adr address.adr port.adr]
    =?  earth-addresses
        ?&  (peer-services-are-sufficient services.adr)
            |(?=(%ipv4 id.adr) ?=(%ipv6 id.adr))
            !(~(has by blacklist) erp)
        ==
      =/  tim  (de-earth-time time.adr)
      =/  erd  (~(get by earth-addresses) erp)
      %+  ~(put by earth-addresses)
          erp
      ?~  erd  [tim services.adr]
      ?:  (lte tim last-heard.u.erd)  u.erd
      :-  tim
          services.adr
    %=  $
        ads  t.ads
    ==
  =.  cor  connect-to-more-peers
  =/  num-addrs  ~(wyt in earth-addresses)
  ?:  (gte num-addrs target-addresses.net-params)  cor
  =/  som  get-some-peer
  ?~  som  cor
  %-  emit
  %+  send:tcp  u.som
  %-  ~(write ne:b-ser network)
  :~  [%getaddr ~]
  ==
::
++  handle-message
  |=  [[erp=earth-address erd=earth-peer-state] msg=message:b-net]
  ^+  cor
  ?+  -.msg  cor  :: TODO: add a case for all messages where the handshake is checked at a minimum
  ::
      %version
    ~&  >  msg
    ?.  ?&  !handshake-done.erd
            (gte version.msg minimum-peer-protocol-version.net-params)
            (peer-services-are-sufficient services.msg)
        ==
      %+  disconnect-peer
          &
          erp
    =:  services.erd         services.msg
        starting-height.erd  starting-height.msg
      ==
    =.  earth-peers  (~(put by earth-peers) erp erd)
    %-  emit
    %+  send:tcp  erp
    %-  ~(write ne:b-ser network)
    :~  [%sendheaders ~]
        [%sendaddrv2 ~]
    ==
  ::
      %wtxidrelay
    ~&  >  msg
    ?:  handshake-done.erd
      %+  disconnect-peer
          &
          erp
    =.  wtxidrelay.erd  &
    %_  cor
        earth-peers  (~(put by earth-peers) erp erd)
    ==
  ::
      %verack
    ~&  >  msg
    ?:  handshake-done.erd
      %+  disconnect-peer
          &
          erp
    =.  handshake-done.erd  &
    =.  earth-peers  (~(put by earth-peers) erp erd)
    %-  emit
    %+  send:tcp  erp
    %-  ~(write ne:b-ser network)
    :+  [%verack ~]
        [%getheaders make-block-locator ~]
    ?:  (gte ~(wyt in earth-addresses) target-addresses.net-params)  ~
    :~  [%getaddr ~]
    ==
  ::
      %ping
    ?.  handshake-done.erd  (disconnect-peer & erp)
    %-  emit
    %+  send:tcp  erp
    %-  ~(write ne:b-ser network)
    :~  [%pong nonce.msg]
    ==
  ::
      %pong
    ?.  handshake-done.erd  (disconnect-peer & erp)
    ?~  outbound-ping.erd  cor
    ?.  =(nonce.msg nonce.u.outbound-ping.erd)  cor
    %_  cor
        earth-peers  (~(put by earth-peers) erp erd(outbound-ping ~))
    ==
  ::
      %addr
    ~&  >>  [%addr (lent addresses.msg)]
    ?.  handshake-done.erd  (disconnect-peer & erp)
    ?:  =(~ addresses.msg)  (disconnect-peer & erp)
    %-  handle-addrv2
    %+  turn  addresses.msg
    |=  adr=address-v1:b-net
    ^-  address-v2:b-net
    :*  time.adr
        services.adr
        %ipv6
        `@`ip.adr
        port.adr
    ==
  ::
      %addrv2
    ~&  >>  [%addrv2 (lent addresses.msg)]
    ?.  handshake-done.erd  (disconnect-peer & erp)
    ?:  =(~ addresses.msg)  (disconnect-peer & erp)
    %-  handle-addrv2
        addresses.msg
  ::
      %inv
    ~&  %inv
    ?.  handshake-done.erd  (disconnect-peer & erp)
    :: TODO: handle block invs by sending getheaders
    cor
  ::
      %getdata
    ?.  handshake-done.erd  (disconnect-peer & erp)
    |-
    ?~  inventory.msg  cor
    =*  inv  i.inventory.msg
    =.  cor
      ?.  ?|  ?=(%msg-tx type.inv)
              ?=(%msg-wtx type.inv)
              ?=(%msg-witness-tx type.inv)
          ==
        cor
      :: serve a tx that was previously announced by inv
      %-  emit
      %+  send:tcp  erp
      %-  ~(write ne:b-ser network)
      :_  ~
      =/  txn  (~(get by tx-broadcast-cache) hash.inv)
      ?~  txn  [%notfound inv ~]
      :-  %tx
      ?.  ?=(%msg-tx type.inv)  u.txn
      %_  u.txn
          flag  0
      ==
    %=  $
        inventory.msg  t.inventory.msg
    ==
  ::
      %block
    ?.  handshake-done.erd  (disconnect-peer & erp)
    :: find a known, valid header corresponding to this block,
    :: and verify this block's transactions against that header's merkle root
    =*  bok  block.msg
    =/  haz  (make-block-hash:b-ser -.bok)
    =/  hed  (~(got by block-headers) haz)
    =*  het  block-height.hed
    =*  wok  chainwork.hed
    =/  mer  (make-merkle-root:b-val +.bok)
    ?.  =(mer merkle-root.block-header.hed)
      ~&  >>>  %block-merkle-root-verification-fail
      %+  disconnect-peer
          &
          erp
    :: update any subscriptions pending this block
    :: TODO: cache block
    =/  hash-reqs  ~(tap in (~(get ju pending-block-hash-reqs) haz))
    =.  cor
      |-
      ?~  hash-reqs  cor
      =.  cor
        ?+  -.i.hash-reqs  cor
        ::
            %block
          =.  pending-block-hash-reqs
            %+  ~(del ju pending-block-hash-reqs)
                haz
                i.hash-reqs
          %-  emil
          %-  ~(res ~(block-by-hash make-update ~) haz)
          :_  bok
          %:  make-block-info
              het
              haz
              wok
          ==
        ::
            %transaction
          =.  pending-block-hash-reqs
            %+  ~(del ju pending-block-hash-reqs)
                haz
                i.hash-reqs
          =/  txn
            ^-  $@(~ [index=@ud =txid =wtxid =transaction])
            =/  ind  0
            |-
            ?~  txs.bok  ~
            =/  tid  (make-txid:b-ser i.txs.bok)
            ?:  =(tid txid.i.hash-reqs)
              =/  wid  (make-wtxid:b-ser i.txs.bok)
              :*  ind
                  tid
                  wid
                  i.txs.bok
              ==
            %=  $
                ind  +(ind)
                txs.bok  t.txs.bok
            ==
          %-  emil
          %-  ~(res ~(transaction make-update ~) haz txid.i.hash-reqs)
          ?~  txn  ~
          :_  txn
          %:  make-block-info
              het
              haz
              wok
          ==
        ::
        ==
      %=  $
          hash-reqs  t.hash-reqs
      ==
    =/  height-reqs  ~(tap in (~(get ju pending-block-height-reqs) het))
    =.  cor
      |-
      ?~  height-reqs  cor
      =.  cor
        ?+  -.i.height-reqs  cor
        ::
            %block
          =.  pending-block-height-reqs
            %+  ~(del ju pending-block-height-reqs)
                het
                i.height-reqs
          %-  emil
          %-  ~(res ~(block-by-height make-update ~) het)
          :_  bok
          %:  make-block-info
              het
              haz
              wok
          ==
        ::
        ==
      %=  $
          height-reqs  t.height-reqs
      ==
    cor
  ::
      %cfilter
    ?.  handshake-done.erd  (disconnect-peer & erp)
    ?>  =(0 filter-type.msg)
    :: verify this filter against our filter headers
    =*  fil  filter.msg
    =*  haz  block-hash.msg
    =/  hed  (~(got by block-headers) haz)
    =*  het  block-height.hed
    =*  wok  chainwork.hed
    ?>  =(haz (got:on-bh-index bh-index block-height.hed))
    =/  prev-height
      ^-  (unit block-height)
      ?:  =(0 block-height.hed)  ~
      :-  ~
      %-  dec
          block-height.hed
    =/  prev-hash
      ^-  (unit block-hash)
      ?~  prev-height  ~
      :-  ~
      %+  got:on-bh-index
          bh-index
          u.prev-height
    =/  prev-filter-header
      ?~  prev-hash  0x0
      %-  ~(got by filter-headers)
          u.prev-hash
    =/  this-filter-header
      %-  ~(got by filter-headers)
          haz
    =/  fed
      %+  make-filter-header:b-fil
          prev-filter-header
      %-  make-filter-hash:b-fil
          fil
    ?.  =(fed this-filter-header)
      ~&  >>>  %block-filter-verification-fail
      %+  disconnect-peer
          &
          erp
    :: cache the block filter
    =.  filters  (~(put by filters) haz fil)
    :: update any subscriptions pending this block filter
    =/  hash-reqs  ~(tap in (~(get ju pending-block-hash-reqs) haz))
    =.  cor
      |-
      ?~  hash-reqs  cor
      =.  cor
        ?+  -.i.hash-reqs  cor
        ::
            %block-filter
          =.  pending-block-hash-reqs
            %+  ~(del ju pending-block-hash-reqs)
                haz
                i.hash-reqs
          %-  emil
          %-  ~(res ~(block-filter-by-hash make-update ~) haz)
          :_  fil
          %:  make-block-info
              het
              haz
              wok
          ==
        ::
        ==
      %=  $
          hash-reqs  t.hash-reqs
      ==
    =/  height-reqs  ~(tap in (~(get ju pending-block-height-reqs) het))
    =.  cor
      |-
      ?~  height-reqs  cor
      =.  cor
        ?+  -.i.height-reqs  cor
        ::
            %block-filter
          =.  pending-block-height-reqs
            %+  ~(del ju pending-block-height-reqs)
                het
                i.height-reqs
          %-  emil
          %-  ~(res ~(block-filter-by-height make-update ~) het)
          :_  fil
          %:  make-block-info
              het
              haz
              wok
          ==
        ::
        ==
      %=  $
          height-reqs  t.height-reqs
      ==
    cor
  ::
      %cfheaders
    ~&  >>  [%filter-headers-from erp]
    ?.  handshake-done.erd  (disconnect-peer & erp)
    =/  len  (lent filter-hashes.msg)
    =/  tip  (~(got by filter-headers) block-hash.best-filter-header)
    =/  til  (got:on-bh-index bh-index (add block-height.best-filter-header len))
    ?>  =(0 filter-type.msg)
    ?>  =(tip previous-filter-header.msg)  :: TODO: follow up on mismatch
    ?>  =(til stop-hash.msg)
    =/  pre  previous-filter-header.msg
    =/  het  +(block-height.best-filter-header)
    =/  is-sync-response
      ?&  ?=(^ header-sync-req)
          ?=(%filter-header for.u.header-sync-req)
          =(block-hash.best-filter-header at.u.header-sync-req)
          =(erp who.u.header-sync-req)
      ==
    =?  cor  is-sync-response
      =/  syc  header-sync-req
      =.  header-sync-req  ~
      %-  emit
      %-  end-header-sync-retry-timer
          syc
    =/  was-synced  is-fully-synced
    |-
    ?~  filter-hashes.msg
      ?.  is-fully-synced  continue-syncing-headers
      ?:  was-synced  cor
      %-  emit
      %~  is-synced  make-update  ~
    =/  haz  (got:on-bh-index bh-index het)
    =/  fed  (make-filter-header:b-fil pre i.filter-hashes.msg)
    =/  height-reqs  ~(tap in (~(get ju pending-block-height-reqs) het))
    =.  cor
      |-
      ?~  height-reqs  cor
      =.  cor
        ?+  -.i.height-reqs  cor
        ::
            %block-filter
          =/  som  get-some-peer
          ?~  som  cor
          =/  req  [%block-filter ~]
          =.  cor  (emit (set-pending-block-height-req-timer het req))
          %-  emit
          %+  send:tcp  u.som
          %-  ~(write ne:b-ser network)
          :~  (make-getcfilters-message het haz)
          ==
        ::
        ==
      %=  $
          height-reqs  t.height-reqs
      ==
    %=  $
        filter-hashes.msg   t.filter-hashes.msg
        pre                 fed
        het                 +(het)
        best-filter-header  [het haz]
        filter-headers      (~(put by filter-headers) haz fed)
    ==
  ::
      %headers
    ~&  >>  [%headers-from erp]
    ?.  handshake-done.erd  (disconnect-peer & erp)
    =/  is-sync-response
      ?&  ?=(^ header-sync-req)
          ?=(%block-header for.u.header-sync-req)
          =(block-hash.best-block at.u.header-sync-req)
          =(erp who.u.header-sync-req)
      ==
    =?  cor  is-sync-response
      =/  syc  header-sync-req
      =.  header-sync-req  ~
      %-  emit
      %-  end-header-sync-retry-timer
          syc
    =/  was-synced  is-fully-synced
    |-
    ?~  headers.msg    :: TODO: increase known height of this peer if now greater
      ?:  is-fully-synced  cor
      =?  cor  was-synced
        :: if we were synced and now aren't, it is because of a reorg
        %-  emit
        %~  is-synced  make-update  ~
      continue-syncing-headers
    =*  hed  i.headers.msg
    =/  val  (~(validate-block-header he:b-val now.bowl block-headers) hed)
    ?-  -.val
    ::
        %redundant
      ?.  .?(t.headers.msg)
        ~&  %redundant-headers
        cor
      %=  $
          headers.msg  t.headers.msg
      ==
    ::
        %orphan
      ~&  [%orphan-block-header block-hash.val hed]
      :: TODO: save orphan headers per peer while unsynced and then process them when synced becomes true
      ?.  is-fully-synced  cor
      %-  emit
      %+  send:tcp  erp
      %-  ~(write ne:b-ser network)
      :~  [%getheaders make-block-locator ~]
      ==
    ::
        %invalid
      ~&  [%invalid-block-header block-hash.val validation-checks.val hed]
      %+  disconnect-peer  &  erp
    ::
        %valid
      =*  haz  block-hash.val
      =*  het  block-height.val
      =*  wok  chainwork.val
      =.  block-headers
        %+  ~(put by block-headers)
            haz
            [het wok hed]
      =/  is-new-best-block  (gth wok chainwork.best-block)
      =/  is-extending-best  =(block-hash.best-block previous-block-hash.hed)
      =/  is-reorg  &(is-new-best-block !is-extending-best)
      ?.  is-reorg
        =?  cor  is-new-best-block  :: TODO: if not extending best, a follow up request should be sent to *that* peer
          =.  best-block  [haz het wok]
          =.  bh-index    (put:on-bh-index bh-index het haz)
          =.  cor
            %-  emit
            %-  ~(best-block make-update ~)
            :+  %new
                het
                haz
          =/  height-reqs  ~(tap in (~(get ju pending-block-height-reqs) het))
          =.  cor
            |-
            ?~  height-reqs  cor
            =.  cor
              ?+  -.i.height-reqs  cor
              ::
                  %block-header
                =.  pending-block-height-reqs
                  %+  ~(del ju pending-block-height-reqs)
                      het
                      i.height-reqs
                %-  emil
                %-  ~(res ~(block-header-by-height make-update ~) het)
                :_  hed
                %:  make-block-info
                    het
                    haz
                    wok
                ==
              ::
                  %block
                =/  som  get-some-peer
                ?~  som  cor
                =/  req  [%block ~]
                =.  cor  (emit (set-pending-block-height-req-timer het req))
                %-  emit
                %+  send:tcp  u.som
                %-  ~(write ne:b-ser network)
                :~  [%getdata [%msg-witness-block haz] ~]
                ==
              ::
              ==
            %=  $
                height-reqs  t.height-reqs
            ==
          cor
        %=  $
            headers.msg  t.headers.msg
        ==
      :: reorg case
      :: - roll back bh-index to the last common block,
      ::   and graft on the new best branch.
      :: - handle changing the best-filter-header
      :: - update affected subscriptions
      ::
      =/  new-best-block  `^best-block`[haz het wok]
      =/  new-best-branch
        ^-  ^bh-index
        =/  new-set
          %-  ~(gas in *(set [block-height block-hash]))
          :~  [block-height.new-best-block block-hash.new-best-block]
          ==
        =/  old-set
          %-  ~(gas in *(set [block-height block-hash]))
          :~  [block-height.best-block block-hash.best-block]
          ==
        =/  new-hash  previous-block-hash.hed
        =/  old-hash
          =<  previous-block-hash.block-header
              (~(got by block-headers) block-hash.best-block)
        |-
        =/  int  (~(int in old-set) new-set)
        ?^  int
          =/  new-branch  (gas:on-bh-index *^bh-index ~(tap in new-set))
          %^  lot:on-bh-index
              new-branch
              [~ -.n.int]
              ~
        =/  new-head  (~(got by block-headers) new-hash)
        =/  old-head  (~(got by block-headers) old-hash)
        %=  $
            new-set   (~(put in new-set) block-height.new-head new-hash)
            old-set   (~(put in old-set) block-height.old-head old-hash)
            new-hash  previous-block-hash.block-header.new-head
            old-hash  previous-block-hash.block-header.old-head
        ==
      =.  bh-index
        %^  lot:on-bh-index  bh-index  ~
        :-  ~
        =<  key.head
        %-  pop:on-bh-index
            new-best-branch
      =/  last-common-block
        ^-  [=block-height =block-hash]
        %-  need
        %-  ram:on-bh-index
            bh-index
      =.  bh-index
        %+  uni:on-bh-index
            bh-index
            new-best-branch
      =.  best-block  new-best-block
      =.  best-filter-header
        =/  las  last-common-block
        |-
        =/  fed  (~(get by filter-headers) block-hash.las)
        ?~  fed  best-filter-header
        =.  best-filter-header  las
        =/  nex  +(block-height.las)
        =/  nax  (get:on-bh-index bh-index nex)
        ?~  nax  best-filter-header
        %=  $
            las  [nex u.nax]
        ==
      =.  cor
        %-  emit
        %-  ~(best-block make-update ~)
        :-  %reorg-rollback
            last-common-block
      =.  cor
        %-  emil
        %-  ~(rep by pending-block-hash-reqs)
        |=  [[key=block-hash val=(set pending-block-hash-req)] acc=(list card)]
        %+  weld  acc
        %+  turn  ~(tap in val)
        |=  req=pending-block-hash-req
        ?-  -.req
            %block-filter  ~(end ~(block-filter-by-hash make-update ~) key)
            %block         ~(end ~(block-by-hash make-update ~) key)
            %transaction   ~(end ~(transaction make-update ~) key txid.req)
        ==
      =.  pending-block-hash-reqs  ~
      =.  cor
        %-  emil
        %-  ~(rep by pending-block-height-reqs)
        |=  [[key=block-height val=(set pending-block-height-req)] acc=(list card)]
        %+  weld  acc
        %+  turn  ~(tap in val)
        |=  req=pending-block-height-req
        ?-  -.req
            %block-header  ~(end ~(block-header-by-height make-update ~) key)
            %block-filter  ~(end ~(block-filter-by-height make-update ~) key)
            %block         ~(end ~(block-by-height make-update ~) key)
        ==
      =.  pending-block-height-reqs  ~
      =.  cor
        %-  emil
        %+  turn  (tap:on-bh-index new-best-branch)
        |=  [key=block-height val=block-hash]
        %-  ~(best-block make-update ~)
        :+  %new
            key
            val
      %=  $
          headers.msg  t.headers.msg
      ==
    ::
    ==
  ::
  ==
::
++  tcp
  |%
  +$  fief
    $%  [%turf p=(list turf) q=@ud]
        [%if p=@if q=@ud]
        [%is p=@is q=@ud]
    ==
  +$  target  [secure=? =fief]
  +$  task
    $%  [%connect =wire =target timeout=(unit @ud)]
        [%send =wire data=octs]
        [%close =wire]
    ==
  +$  gift
    $%  [%connected =wire]
        [%receive =wire data=octs]
        [%closed =wire]
        [%error =wire msg=@t]
    ==
  ::
  ++  open
    |=  erp=earth-address
    ^-  (list card)
    ?>  |(?=(%ipv4 net-id.erp) ?=(%ipv6 net-id.erp))
    =/  paf  (en-earth-peer-path erp)
    =/  sid  (weld /tcp paf)
    :~  [%pass (weld /tcp/connect paf) %agent [our.bowl %tcp] %poke %tcp-task !>([%connect sid [%.n %if `@`address.erp port.erp] ~])]
        [%pass sid %agent [our.bowl %tcp] %watch sid]
    ==
  ::
  ++  close
    |=  erp=earth-address
    ^-  (list card)
    =/  paf  (en-earth-peer-path erp)
    =/  sid  (weld /tcp paf)
    :~  [%pass (weld /tcp/poke paf) %agent [our.bowl %tcp] %poke %tcp-task !>([%close sid])]
        [%pass (weld /tcp/watch paf) %agent [our.bowl %tcp] %leave ~]
    ==
  ::
  ++  send
    |=  [erp=earth-address dat=octs]
    ^-  card
    =/  paf  (en-earth-peer-path erp)
    =/  sid  (weld /tcp paf)
    [%pass (weld /tcp/poke paf) %agent [our.bowl %tcp] %poke %tcp-task !>([%send sid dat])]
  ::
  --
::
  ::
::
++  init
  ^+  cor
  =/  gen  genesis-block-header:b-val
  =/  val  (~(validate-block-header he:b-val now.bowl block-headers) gen)
  ?>  ?=(%valid -.val)
  =*  haz  block-hash.val
  =*  het  block-height.val
  =*  wok  chainwork.val
  =.  net-params
    %_  net-params
        target-addresses                             500
        target-peers                                 10
        minimum-peer-protocol-version                70.016
        node-network.required-peer-services          &
        node-witness.required-peer-services          &
        node-compact-filters.required-peer-services  &
        blacklist-expiration                         ~d3
        blacklist-interval                           ~d1
        ping-interval                                ~m2
        pending-req-retry-interval                   ~s5
        header-sync-retry-interval                   ~s5
        tx-inv-broadcast-retry-interval              ~s15
        tx-broadcast-cache-expiration                ~s30
    ==
  =.  cor  (emit set-blacklist-timer)
  %_  cor
      network        %mainnet
      services       services(node-witness &)
  ::
      best-block     [haz het wok]
      bh-index       (put:on-bh-index bh-index het haz)
      block-headers  (~(put by block-headers) haz het wok gen)
  ::
      best-filter-header  [het haz]
      filter-headers      (~(put by filter-headers) haz genesis-filter-header:b-fil)
      filters             (~(put by filters) haz genesis-filter:b-fil)
  ==
::
++  save
  ^-  vase
  !>  state
::
++  load
  |=  vaz=vase
  ^+  cor
  =.  cor
    =/  old  (mole |.(!<(state-n vaz)))
    ?~  old
      ~&  >>>  [dap.bowl %load-state-reset]
      init
    ?-  -.u.old
      %0  cor(state u.old)
    ==
  =.  cor  connect-to-more-peers
  cor
::
--
::
^-  agent:gall
|_  =bowl:gall
+*  this  .
    cor  ~(. +> [bowl ~])
::
++  on-init
  ^-  (quip card _this)
  =^  cards  state  abet:init:cor
  :-  cards  this
::
++  on-save
  ^-  vase
  =<  save  cor
::
++  on-load
  |=  =vase
  ^-  (quip card _this)
  =^  cards  state  abet:(load:cor vase)
  :-  cards  this
::
++  on-poke
  |=  [=mark =vase]
  ^-  (quip card _this)
  =^  cards  state  abet:(poke:cor mark vase)
  :-  cards  this
::
++  on-watch
  |=  =path
  ^-  (quip card _this)
  =^  cards  state  abet:(watch:cor path)
  :-  cards  this
::
++  on-leave
  |=  =path
  ^-  (quip card _this)
  =^  cards  state  abet:(leave:cor path)
  :-  cards  this
::
++  on-peek
  |=  =path
  ^-  (unit (unit cage))
  %-  peek:cor  path
::
++  on-agent
  |=  [=wire =sign:agent:gall]
  ^-  (quip card _this)
  =^  cards  state  abet:(agent:cor wire sign)
  :-  cards  this
::
++  on-arvo
  |=  [=wire sign=sign-arvo]
  ^-  (quip card _this)
  =^  cards  state  abet:(arvo:cor wire sign)
  :-  cards  this
::
++  on-fail
  |=  [=term =tang]
  ^-  (quip card _this)
  =^  cards  state  abet:(fail:cor term tang)
  :-  cards  this
--

