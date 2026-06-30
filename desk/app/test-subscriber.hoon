/-  *bitcoin-light-client
|%
+$  state-0
  $:  ~
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
      %get-block-header-by-hash
    =/  hat  !<(@t vaz)
    =/  haz  q:(need (de:base16:mimes:html hat))
    %-  emit
    %-  watch-light-client
        /block-header/hash/[(scot %ux haz)]
  ::
      %get-block-filter-by-hash
    =/  hat  !<(@t vaz)
    =/  haz  q:(need (de:base16:mimes:html hat))
    %-  emit
    %-  watch-light-client
        /block-filter/hash/[(scot %ux haz)]
  ::
      %get-block-by-hash
    =/  hat  !<(@t vaz)
    =/  haz  q:(need (de:base16:mimes:html hat))
    %-  emit
    %-  watch-light-client
        /block/hash/[(scot %ux haz)]
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
  cor
::
++  agent
  |=  [wir=wire sin=sign:agent:gall]
  ^+  cor
  ~&  wir
  ?+  wir  cor
  ::
      [%best-block ~]
    ?.  ?=(%fact -.sin)  cor
    =/  dat  !<(best-block:update q.cage.sin)
    ~&  >  dat
    cor
  ::
      [%is-synced ~]
    ?.  ?=(%fact -.sin)  cor
    =/  dat  !<(is-synced:update q.cage.sin)
    ~&  >  dat
    cor
  ::
      [%block-header %hash *]
    ?:  ?=(%kick -.sin)
      ~&  >>  [%kick wir]
      cor
    ?.  ?=(%fact -.sin)
      cor
    =/  dat  !<(block-header-by-hash:update q.cage.sin)
    ~&  >  dat
    cor
  ::
      [%block-filter %hash *]
    ?:  ?=(%kick -.sin)
      ~&  >>  [%kick wir]
      cor
    ?.  ?=(%fact -.sin)
      cor
    =/  dat  !<(block-filter-by-hash:update q.cage.sin)
    ?~  dat
      ~&  >  dat
      cor
    ~&  >  -.dat
    ~&  >  [%filter-wid wid.filter.dat]
    cor
  ::
      [%block %hash *]
    ?:  ?=(%kick -.sin)
      ~&  >>  [%kick wir]
      cor
    ?.  ?=(%fact -.sin)
      cor
    =/  dat  !<(block-by-hash:update q.cage.sin)
    ?~  dat
      ~&  >  dat
      cor
    ~&  >  -.dat
    ~&  >  -.block.dat
    ~&  >  [%txs (lent txs.block.dat)]
    cor
  ::
  ==
::
++  watch-light-client
  |=  =path
  ^-  card
  [%pass path %agent [our.bowl %bitcoin-client] %watch path]
::
  ::
::
++  init
  ^+  cor
  %-  emil
  :~  (watch-light-client /best-block)
      (watch-light-client /is-synced)
  ==
::
++  save
  ^-  vase
  !>  ~
::
++  load
  |=  vaz=vase
  ^+  cor
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

