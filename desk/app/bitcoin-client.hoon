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
      required-peer-services=services:b-net
      blacklist-expiration=@dr
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
  $:  starting-height=block-height
      last-heard=time
      =services:b-net
      :: messages-pending-response=(set message:b-net)  :: TODO: contemplate this
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
+$  is-synced  _|
::
+$  best-block  [=block-hash =block-height =chainwork]
+$  bh-index    ((mop block-height block-hash) lth)
::
+$  best-filter-header  [=block-height =block-hash]
+$  filter-headers      (map block-hash filter-header:b-fil)
+$  filters             (map block-hash filter:b-fil)
::
+$  state-0
  $:  =protocol-version:b-net
      =network:b-net
      =net-params
      =earth-peers
      =earth-addresses
      =blacklist
      =pending-block-hash-reqs
      =pending-block-height-reqs
      =is-synced
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
    ~&       [%protocol-version protocol-version]
    ~&       [%network network]
    ~&       [%net-params net-params]
    ~&  >    [%best-block best-block]
    ~&  >    [%is-synced is-synced]
    ~&  >    [%bh-index ~(wyt in bh-index)]
    ~&  >    [%headers ~(wyt in block-headers)]
    ~&  >>   [%best-filter-header best-filter-header]
    ~&  >>   [%filter-headers ~(wyt in filter-headers)]
    ~&  >>   [%filters ~(wyt in filters)]
    ~&  >>>  [%pending-block-hash-reqs pending-block-hash-reqs]
    ~&  >>>  [%pending-block-height-reqs pending-block-height-reqs]
    ~&  >>>  [%earth-addresses ~(wyt in earth-addresses)]
    ~&  >>>  [%earth-peers ~(wyt in earth-peers)]
    cor
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
    =/  som  get-some-peer
    ?~  som  !!
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
      =/  som  get-some-peer
      ?~  som  !!
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
    =/  som  get-some-peer
    ?~  som  !!
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
      =/  som  get-some-peer
      ?~  som  !!
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
    =/  som  get-some-peer
    ?~  som  !!
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
      ~
    cor
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
      ~&  >  %tcp-connected
      cor
    ::
        %closed
      ~&  >>>  %tcp-closed
      %+  disconnect-peer  |  erp
    ::
        %error
      ~&  >>>  [%tcp-error msg.gif]
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
    =/  dat  `is-synced:update`^is-synced
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
  =/  pes  ~(key by earth-peers)
  =/  siz  ~(wyt in pes)
  ?:  =(0 siz)  ~
  =/  ind  (~(rad og eny.bowl) siz)
  :-  ~
  %+  snag
      ind
      ~(tap in pes)
::
++  connect-to-peer
  |=  erp=earth-address
  ^+  cor
  ?<  (~(has by earth-peers) erp)
  ?>  |(?=(%ipv4 net-id.erp) ?=(%ipv6 net-id.erp))
  =.  earth-peers  (~(put by earth-peers) erp *earth-peer-state)
  %-  emil
  %+  open:tcp
      erp
  %-  ~(write ne:b-ser network)
      make-connect-messages
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
  =/  erd  (~(get by earth-peers) erp)
  ?~  erd  cor
  =*  erd  u.erd
  =.  earth-peers  (~(del by earth-peers) erp)
  :: =.  cor
  ::   =/  mes  ~(tap in messages-pending-response.erd)
  ::   |-
  ::   ?~  mes  cor
  ::   ?.  ?|  ?=(%getdata -.i.mes)
  ::           ?=(%getblocks -.i.mes)
  ::           ?=(%getheaders -.i.mes)
  ::           ?=(%getaddr -.i.mes)
  ::           ?=(%getcfilters -.i.mes)
  ::           ?=(%getcfheaders -.i.mes)
  ::           ?=(%getcfcheckpt -.i.mes)
  ::       ==
  ::     %=  $
  ::         mes  t.mes
  ::     ==
  ::   =/  som  get-some-peer  :: TODO: if there are no peers, these messages will get dropped...
  ::   ?~  som  cor
  ::   =/  sod  (~(got by earth-peers) u.som)
  ::   =.  sod  (~(put in sod) i.mes)
  ::   =.  cor
  ::     =.  earth-peers  (~(put by earth-peers) u.som sod)
  ::     %-  emit
  ::     %+  send:tcp  u.som
  ::     %-  ~(write ne:b-ser network)
  ::     :~  i.mes
  ::     ==
  ::   %=  $
  ::       mes  t.mes
  ::   ==
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
      =/  dat  [last-heard.erd services.erd]
      %_  cor
          earth-addresses  (~(put by earth-addresses) erp dat)
      ==
    ::
    ==
  =.  cor  connect-to-more-peers
  ?~  earth-peers   :: TODO: improve / remove sync state
    =.  is-synced  |
    %-  emit
    %~  is-synced  make-update  ~
  cor
::
++  make-connect-messages
  ^-  (list message:b-net)
  =-  [- [%sendheaders ~] [%sendaddrv2 ~] ~]
  :-  %version
  =/  ver  *version-payload:b-net
  %_  ver
      version     protocol-version
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
++  handle-message
  |=  [[erp=earth-address erd=earth-peer-state] msg=message:b-net]
  ^+  cor
  ?+  -.msg  cor
  ::
      %version
    ~&  >  msg
    ?.  ?&  =(version.msg protocol-version)
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
    :+  [%verack ~]
        [%getheaders make-block-locator ~]
    ?:  (gte ~(wyt in earth-addresses) target-addresses.net-params)  ~
    :~  [%getaddr ~]
    ==
  ::
      %ping
    %-  emit
    %+  send:tcp  erp
    %-  ~(write ne:b-ser network)
    :~  [%pong nonce.msg]
    ==
  ::
      %addr
    ~&  >>  [%addr (lent addresses.msg)]
    ?:  =(~ addresses.msg)  (disconnect-peer & erp)
    :: TODO: save as addrv2
    cor
  ::
      %addrv2
    ~&  >>  [%addrv2 (lent addresses.msg)]
    ?:  =(~ addresses.msg)  (disconnect-peer & erp)
    :: save any new addresses which meet our required services
    =.  cor
      |-
      ?~  addresses.msg  cor
      =*  adr  i.addresses.msg
      =?  earth-addresses
          ?&  (peer-services-are-sufficient services.adr)
              |(?=(%ipv4 id.adr) ?=(%ipv6 id.adr))
          ==
        =/  tim  (de-earth-time time.adr)
        =/  new  [id.adr address.adr port.adr]
        =/  aud  (~(get by earth-addresses) new)
        %+  ~(put by earth-addresses)
            new
        ?~  aud  [tim services.adr]
        ?:  (lte tim last-heard.u.aud)  u.aud
        :-  tim
            services.adr
      %=  $
          addresses.msg  t.addresses.msg
      ==
    =.  cor  connect-to-more-peers                        :: TODO: move to a timer loop
    :: if we still lack addresses, get more from some peer
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
      %inv
    ~&  >>  %inv
    :: TODO: handle block invs by sending getheaders
    cor
  ::
      %block
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
    =/  len  (lent filter-hashes.msg)
    =/  tip  (~(got by filter-headers) block-hash.best-filter-header)
    =/  til  (got:on-bh-index bh-index (add block-height.best-filter-header len))
    ?>  =(0 filter-type.msg)
    ?>  =(tip previous-filter-header.msg)
    ?>  =(til stop-hash.msg)
    =/  pre  previous-filter-header.msg
    =/  het  +(block-height.best-filter-header)
    |-
    ?~  filter-hashes.msg
      ?:  =(block-hash.best-filter-header block-hash.best-block)
        ?:  is-synced  cor
        =.  is-synced  &
        %-  emit
        %~  is-synced  make-update  ~
      =/  som  get-some-peer
      ?~  som  cor
      %-  emit
      %+  send:tcp  u.som
      %-  ~(write ne:b-ser network)
      :~  make-getcfheaders-message
      ==
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
    :: current heuristic for determining if block headers are synced:
    :: keep requesting headers until a headers response is null  :: TODO: improve this
    ?.  .?(headers.msg)
      ?:  =(block-hash.best-block block-hash.best-filter-header)
        ?:  is-synced  cor
        =.  is-synced  &
        %-  emit
        %~  is-synced  make-update  ~
      :: if block headers are caught up and filter headers aren't,
      :: get filter headers
      =/  som  get-some-peer
      ?~  som  cor
      %-  emit
      %+  send:tcp  u.som
      %-  ~(write ne:b-ser network)
      :~  make-getcfheaders-message
      ==
    |-
    ?~  headers.msg
      =/  som  get-some-peer
      ?~  som  cor
      %-  emit
      %+  send:tcp  u.som
      %-  ~(write ne:b-ser network)
      :~  [%getheaders make-block-locator ~]
      ==
    =*  hed  i.headers.msg
    =/  val  (~(validate-block-header he:b-val now.bowl block-headers) hed)
    ?-  -.val
    ::
        %redundant
      ?:  =(~ t.headers.msg)
        ~&  >>>  %redundant-block-headers
        cor
      %=  $
          headers.msg  t.headers.msg
      ==
    ::
        %orphan
      ~&  [%orphan-block-header block-hash.val hed]
      %-  emit
      %+  send:tcp  erp
      %-  ~(write ne:b-ser network)
      :~  [%getheaders make-block-locator ~]
      ==
    ::
        %invalid
      ~&  [%invalid-block-header block-hash.val validation-checks.val hed]
      %+  disconnect-peer
          &
          erp
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
        =?  cor  is-new-best-block
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
        =.  is-synced  |
        %-  emit
        %~  is-synced  make-update  ~
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
    $%  [%connect =wire =target]
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
    |=  [erp=earth-address dat=octs]
    ^-  (list card)
    ?>  |(?=(%ipv4 net-id.erp) ?=(%ipv6 net-id.erp))
    =/  paf  (en-earth-peer-path erp)
    =/  sid  (weld /tcp paf)
    :~  [%pass (weld /tcp/connect paf) %agent [our.bowl %tcp] %poke %tcp-task !>([%connect sid [%.n %if `@`address.erp port.erp]])]
        [%pass sid %agent [our.bowl %tcp] %watch sid]
        (send erp dat)
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
        target-addresses  500
        target-peers      5
        node-network.required-peer-services          &
        node-witness.required-peer-services          &
        node-compact-filters.required-peer-services  &
        blacklist-expiration  ~d5
    ==
  %_  cor
      network        %mainnet
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
  =.  cor  connect-to-more-peers                        :: TODO: move to a timer loop
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

