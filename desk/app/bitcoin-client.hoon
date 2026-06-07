/-  *bitcoin-common
/+  b-val=bitcoin-validation,
    b-ser=bitcoin-serialization
|%
+$  active-chain-tip  [=block-height =block-hash]
+$  bh-index  ((mop block-height block-hash) lth)
::
:: +$  core-http-config  $@(~ node-config:b-http)
::
+$  state-0
  $:  =active-chain-tip
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
      ~
    cor
  ::     %download-headers
  ::   ?>  ?=(^ core-http-config)
  ::   =/  het  0
  ::   %-  emit
  ::   %:  make-request:json-rpc:b-http
  ::       /core-http/json-rpc/block-hash-batch/[(scot %ud het)]/[now-t]
  ::       core-http-config
  ::       [%get-block-hash-batch het 100]
  ::   ==
  ::
  ::    %configure-core-http
  ::  =/  fig  !<(^core-http-config vaz)
  ::  %_  cor
  ::      core-http-config  fig
  ::  ==
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
  |=  [wir=wire sin=sign:agent:gall]
  ^+  cor
  cor
::
  ::
::
++  now-t  (scot %da now.bowl)
::
++  on-bh-index  ((on block-height block-hash) lth)
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

