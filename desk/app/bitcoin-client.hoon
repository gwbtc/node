/-  *bitcoin-common,
    b-net=bitcoin-network
/+  b-val=bitcoin-validation,
    b-ser=bitcoin-serialization
|%
+$  earth-peer
  $:  net-id=network-address-id:b-net
      address=@ux
      port=@ud
  ==
+$  earth-peer-state
  $:  last-connected=time
      =services:b-net
      buffer=hexb
  ==
+$  earth-peers  (map earth-peer earth-peer-state)
::
+$  best-block  [=block-hash =block-height =chainwork]
+$  bh-index  ((mop block-height block-hash) lth)
::
+$  state-0
  $:  =protocol-version:b-net
      =network:b-net
      =earth-peers
      =best-block
      =bh-index
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
  ?+  mak  ~|(bad-poke/mak !!) 
  ::
      %log-block-headers-info
    ~&  >>  [%best-block best-block]
    ~&  >>  [%bh-index ~(wyt in bh-index)]
    ~&  >>  [%headers ~(wyt in block-headers)]
    cor
  ::
      %log-block-header
    =/  het  !<(block-height vaz)
    =/  haz  (got:on-bh-index bh-index het)
    =/  hed  (~(got by block-headers) haz)
    ~&  >  haz
    ~&  >  hed
    cor
  ::
      %open-tcp
    =/  erp  !<(earth-peer vaz)
    ?:  .?(earth-peers)
      ~&  >>>  [%more-than-one-peer-not-supported earth-peers]
      !!
    ?.  ?=(%ipv4 net-id.erp)
      ~&  >>>  [%need-ipv4 erp]
      !!
    =.  earth-peers  (~(put by earth-peers) erp *earth-peer-state)
    %-  emil  (open:tcp erp)
  ::
      %close-tcp
    ?.  .?(earth-peers)
      ~&  >>>  %no-connections
      !!
    =/  erp  `earth-peer`p:(rear ~(tap by earth-peers))
    =.  earth-peers  ~
    %-  emil  (close:tcp erp)
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
  cor
::
++  leave
  |=  poe=(pole @ta)
  ^+  cor
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
      ~&  >  %tcp-receive
      =^  mes  buffer.erd  (~(read ne:b-ser network) data.gif buffer.erd)
      =.  last-connected.erd  now.bowl
      =.  earth-peers  (~(put by earth-peers) erp erd)
      |-
      ?~  mes  cor
      ~&  -.i.mes
      =.  cor  (handle-message [erp erd] i.mes)
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
      cor
    ::
        %error
      ~&  >>>  [%tcp-error msg.gif]
      cor
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
++  en-earth-peer-path
  |=  erp=earth-peer
  ^-  path
  /[net-id.erp]/[(scot %ux address.erp)]/[(scot %ud port.erp)]
::
++  de-earth-peer-path
  |=  paf=path
  ^-  earth-peer
  ?>  ?=([@ @ @ ~] paf)
  :*  (network-address-id:b-net i.paf)
      (slav %ux i.t.paf)
      (slav %ud i.t.t.paf)
  ==
::
++  make-connect-messages
  ^-  (list message:b-net)
  =-  [- [%sendheaders ~] [%sendaddrv2 ~] ~]
  :-  %version
  =/  ver  *version-payload:b-net
  %_  ver
      version     protocol-version
      time        (div (sub now.bowl ~1970.1.1) ~s1)
      user-agent  'urbit'
  ==
::
++  handle-message
  |=  [[erp=earth-peer erd=earth-peer-state] msg=message:b-net]
  ^+  cor
  ?+  -.msg  cor
  ::
      %version
    =.  services.erd  services.msg
    =.  earth-peers  (~(put by earth-peers) erp erd)
    =/  mes
      :~  [%verack ~]
          [%getheaders make-block-locator ~]
      ==
    %-  emit
    %+  send:tcp
        erp
        (~(write ne:b-ser network) mes)
  ::
      %ping
    =/  mes
      :~  [%pong nonce.msg]
      ==
    %-  emit
    %+  send:tcp
        erp
        (~(write ne:b-ser network) mes)
  ::
      %addrv2
    ~&  >>  [%addresses (lent addresses.msg)]
    cor
  ::
      %inv
    ~&  >>  [%inv type:(rear inventory.msg)]
    cor
  ::
      %headers
    ~&  >>>  [%headers (lent headers.msg)]
    |-
    ?~  headers.msg  cor
    =*  hed  i.headers.msg
    =/  val  (~(validate-block-header he:b-val now.bowl block-headers) hed)
    ?-  -.val
    ::
        %redundant
      ~&  [%redundant-block-header block-hash.val]
      %=  $
          headers.msg  t.headers.msg
      ==
    ::
        %orphan
      ~&  [%orphan-block-header block-hash.val hed]
      cor
    ::
        %invalid
      ~&  [%invalid-block-header block-hash.val validation-checks.val hed]
      cor
    ::
        %valid
      =*  haz  block-hash.val
      =*  het  block-height.val
      =*  wok  chainwork.val
      =/  is-new-best-block  (gth wok chainwork.best-block)
      =/  is-extending-active  =(block-hash.best-block previous-block-hash.hed)
      =/  is-reorg  &(is-new-best-block !is-extending-active)
      ?:  is-reorg
        ~&  >>>  [%reorg haz het hed]
        !!
      =?  best-block  is-new-best-block  [haz het wok]
      =?  bh-index    is-new-best-block  (put:on-bh-index bh-index het haz)
      %=  $
          headers.msg    t.headers.msg
          block-headers  (~(put by block-headers) haz het wok hed)
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
    |=  erp=earth-peer
    ^-  (list card)
    ?>  ?=(%ipv4 net-id.erp)
    =/  paf  (en-earth-peer-path erp)
    =/  sid  (weld /tcp paf)
    =/  dat  (~(write ne:b-ser network) make-connect-messages)
    :~  [%pass (weld /tcp/connect paf) %agent [our.bowl %tcp] %poke %tcp-task !>([%connect sid [%.n %if `@`address.erp port.erp]])]
        [%pass sid %agent [our.bowl %tcp] %watch sid]
        (send erp dat)
    ==
  ::
  ++  close
    |=  erp=earth-peer
    ^-  (list card)
    =/  paf  (en-earth-peer-path erp)
    =/  sid  (weld /tcp paf)
    :~  [%pass (weld /tcp/poke paf) %agent [our.bowl %tcp] %poke %tcp-task !>([%close sid])]
        [%pass (weld /tcp/watch paf) %agent [our.bowl %tcp] %leave ~]
    ==
  ::
  ++  send
    |=  [erp=earth-peer dat=octs]
    ^-  card
    =/  paf  (en-earth-peer-path erp)
    =/  sid  (weld /tcp paf)
    [%pass (weld /tcp/poke paf) %agent [our.bowl %tcp] %poke %tcp-task !>([%send sid dat])]
  ::
  --
::
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
  %_  cor
      network        %mainnet
      best-block     [haz het wok]
      bh-index       (put:on-bh-index bh-index het haz)
      block-headers  (~(put by block-headers) haz het wok gen)
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

