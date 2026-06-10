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
+$  active-chain-tip  [=block-height =block-hash]
+$  bh-index  ((mop block-height block-hash) lth)
::
+$  state-0
  $:  =earth-peers
      =active-chain-tip
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
      %open-tcp
    =/  erp  !<(earth-peer vaz)
    ?:  .?(earth-peers)
      ~&  >>>  [%more-than-one-peer-not-supported earth-peers]
      !!
    ?.  ?=(%ipv4 net-id.erp)
      ~&  >>>  [%need-ipv4 erp]
      !!
    =.  earth-peers  (~(put by earth-peers) erp *earth-peer-state)
    %-  emil  (tcp-open erp)
  ::
      %close-tcp
    ?.  .?(earth-peers)
      ~&  >>>  %no-connections
      !!
    =/  erp  `earth-peer`p:(rear ~(tap by earth-peers))
    =.  earth-peers  ~
    %-  emil  (tcp-close erp)
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
  ::     [%core-http %json-rpc %block-hash-batch height=@t *]
  ::   =/  het  (slav %ud height.wir)
  ::   ?+  sin  cor
  ::   ::
  ::       [%iris %http-response %finished *]
  ::     =*  sus  status-code.response-header.client-response.sin
  ::     ?:  (gte sus 400)
  ::       ~&  >>>  `@t`(cat 3 'RPC request failed: ' (scot %ud sus))
  ::       !!
  ::     =/  rus  (handle-response:json-rpc:b-http client-response.sin)
  ::     ?~  rus
  ::       ~&  >>>  'RPC response parsing failed'
  ::       !!
  ::     =*  res  u.rus
  ::     ?+  -.res  !!
  ::     ::
  ::         %get-block-hash-batch
  ::       ?>  ?=(^ core-http-config)
  ::       %-  emit
  ::       %:  make-request:json-rpc:b-http
  ::           /core-http/json-rpc/block-header-batch/[(scot %ud het)]/[now-t]
  ::           core-http-config
  ::           [%get-block-header-batch batch.res]
  ::       ==
  ::     ::
  ::     ==
  ::   ::
  ::   ==
  :: ::
  ::     [%core-http %json-rpc %block-header-batch height=@t *]
  ::   =/  het  (slav %ud height.wir)
  ::   ?+  sin  cor
  ::   ::
  ::       [%iris %http-response %finished *]
  ::     =*  sus  status-code.response-header.client-response.sin
  ::     ?:  (gte sus 400)
  ::       ~&  >>>  `@t`(cat 3 'RPC request failed: ' (scot %ud sus))
  ::       !!
  ::     =/  rus  (handle-response:json-rpc:b-http client-response.sin)
  ::     ?~  rus
  ::       ~&  >>>  'RPC response parsing failed'
  ::       !!
  ::     =*  res  u.rus
  ::     ?+  -.res  !!
  ::     ::
  ::         %get-block-header-batch
  ::       cor
  ::       ::=/  val
  ::       ::  %.  batch.res
  ::       ::  %~  validate-block-headers  he:b-val
  ::       ::  :-  now.bowl
  ::       ::      block-headers
  ::       ::?^  val
  ::       ::  ~&  >>>  ['header validation failed:' val]
  ::       ::  !!
  ::       ::=.  block-headers  (gas:on-block-headers block-headers batch.res)
  ::       ::=/  nex  (add het (lent batch.res))
  ::       ::?>  ?=(^ core-http-config)
  ::       ::%-  emit
  ::       ::%:  make-request:json-rpc:b-http
  ::       ::    /core-http/json-rpc/block-hash-batch/[(scot %ud nex)]/[now-t]
  ::       ::    core-http-config
  ::       ::    [%get-block-hash-batch nex 100]
  ::       ::==
  ::     ::
  ::     ==
  ::   ::
  ::   ==
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
    ~&  >  [%peer erp erd]
    =/  gif  !<(tcp-gift q.cage.sin)
    ?-  -.gif
    ::
        %receive
      ~&  >  %tcp-receive
      =^  mes  buffer.erd  (~(read ne:b-ser %mainnet) data.gif buffer.erd)
      ~&  mes
      |-
      ?~  mes
        =.  last-connected.erd  now.bowl
        %_  cor
            earth-peers  (~(put by earth-peers) erp erd)
        ==
      =.  cor
        ?+  -.i.mes  cor
        ::
            %version
          =.  services.erd  services.i.mes
          =/  dat  (~(write ne:b-ser %mainnet) [%verack ~] ~)
          %-  emit  (tcp-send erp dat)
        ::
            %ping
          =/  dat  (~(write ne:b-ser %mainnet) [%pong nonce.i.mes] ~)
          %-  emit  (tcp-send erp dat)
        ::
        ==
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
+$  tcp-fief
  $%  [%turf p=(list turf) q=@ud]
      [%if p=@if q=@ud]
      [%is p=@is q=@ud]
  ==
+$  tcp-target  [secure=? =tcp-fief]
+$  tcp-task
  $%  [%connect =wire =tcp-target]
      [%send =wire data=octs]
      [%close =wire]
  ==
+$  tcp-gift
  $%  [%connected =wire]
      [%receive =wire data=octs]
      [%closed =wire]
      [%error =wire msg=@t]
  ==
::
++  tcp-open
  |=  erp=earth-peer
  ^-  (list card)
  ?>  ?=(%ipv4 net-id.erp)
  =/  paf  (en-earth-peer-path erp)
  =/  sid  (weld /tcp paf)
  =/  dat  (~(write ne:b-ser %mainnet) make-version-message ~)
  :~  [%pass (weld /tcp/connect paf) %agent [our.bowl %tcp] %poke %tcp-task !>([%connect sid [%.n %if `@`address.erp port.erp]])]
      [%pass sid %agent [our.bowl %tcp] %watch sid]
      (tcp-send erp dat)
  ==
::
++  tcp-close
  |=  erp=earth-peer
  ^-  (list card)
  =/  paf  (en-earth-peer-path erp)
  =/  sid  (weld /tcp paf)
  :~  [%pass (weld /tcp/poke paf) %agent [our.bowl %tcp] %poke %tcp-task !>([%close sid])]
      [%pass (weld /tcp/watch paf) %agent [our.bowl %tcp] %leave ~]
  ==
::
++  tcp-send
  |=  [erp=earth-peer dat=octs]
  ^-  card
  =/  paf  (en-earth-peer-path erp)
  =/  sid  (weld /tcp paf)
  [%pass (weld /tcp/poke paf) %agent [our.bowl %tcp] %poke %tcp-task !>([%send sid dat])]
::
++  make-version-message
  ^-  message:b-net
  :-  %version
  =/  ver  *version-payload:b-net
  %_  ver
      version     70.016
      time        (div (sub now.bowl ~1970.1.1) ~s1)
      user-agent  'tcp-test'
  ==
::
  ::
::
++  init
  ^+  cor
  cor
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
      cor
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

