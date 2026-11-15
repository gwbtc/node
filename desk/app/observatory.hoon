/-  *observatory
|%
::
+$  state-0
  $:  ~
  ==
::
+$  state-n
  $%  [%0 state-0]
  ==
::
+$  card  card:agent:gall
--
::
=+  [%0 *state-0]
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
  :: ?+  mak  ~|(bad-poke/mak !!)
  :: ::
  ::     %noun
  ::   cor
  :: ::
  :: ==
  cor
::
++  peek
  |=  poe=(pole @ta)
  ^-  (unit (unit cage))
  ?+  poe  ~
  ::
      [%x %our ~]
    =/  dat
      ^-  our-data
      [[our.bowl ''] gw-custody:scry]      :: NOTE: add nym
    :+  ~  ~
    :-  %observatory-our
    !>  dat
  ::
      [%x %comets ~]
    =/  cuz  gw-confidential:scry
    =/  dat
      ^-  comets
      %+  turn  ~(tap in cuz)
      |=  who=@p
      ^-  [comet sponsor=(unit comet)]
      :-  [who '']                       :: NOTE: add nym
      =/  sax  (jael-saxo:scry who)
      ?~  sax  ~
      ?~  t.sax  ~
      :-  ~
          [i.t.sax '']                   :: NOTE: add nym
    :+  ~  ~
    :-  %observatory-comets
    !>  dat
  ::
      [%x %peer patp=@ ~]
    =/  who  (slaw %p patp.poe)
    ?~  who  [~ ~]
    =/  per  (ames-peer:scry u.who)
    ?.  ?=(%known -.per)  [~ ~]
    :+  ~  ~
    :-  %observatory-peer
    !>  +.per
  ::
  ==
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
  cor
::
  ::
::
++  scry
  |%
  ::
  ++  gw-points
    .^  (map @p gw-point)
        %gx
        /[(scot %p our.bowl)]/gw-btc/[(scot %da now.bowl)]/points/noun
    ==
  ::
  ++  gw-trusted
    .^  (map @p @da)
        %gx
        /[(scot %p our.bowl)]/gw-btc/[(scot %da now.bowl)]/trusted/noun
    ==
  ::
  ++  gw-confidential
    .^  (set @p)
        %gx
        /[(scot %p our.bowl)]/gw-btc/[(scot %da now.bowl)]/confidential/noun
    ==
  ::
  ++  gw-attested
    .^  (map @p gw-satpoint)
        %gx
        /[(scot %p our.bowl)]/gw-btc/[(scot %da now.bowl)]/attested/noun
    ==
  ::
  ++  gw-sponsees
    .^  (map @p [life=@ud since=@da])
        %gx
        /[(scot %p our.bowl)]/gw-btc/[(scot %da now.bowl)]/sponsees/noun
    ==
  ::
  ++  gw-declined
    .^  (set @p)
        %gx
        /[(scot %p our.bowl)]/gw-btc/[(scot %da now.bowl)]/declined/noun
    ==
  ::
  ++  gw-custody
    .^  gw-custody-log
        %gx
        /[(scot %p our.bowl)]/gw-btc/[(scot %da now.bowl)]/custody/noun
    ==
  ::
  ++  ames-peer
    |=  who=@p
    .^  ship-state:ames
        %ax
        /[(scot %p our.bowl)]//[(scot %da now.bowl)]/peers/[(scot %p who)]
    ==
  ::
  ++  ames-chum
    |=  who=@p
    .^  chum-state:ames
        %ax
        /[(scot %p our.bowl)]//[(scot %da now.bowl)]/chums/[(scot %p who)]
    ==
  ::
  ++  jael-saxo
    |=  who=@p
    .^  (list @p)
        %j
        /[(scot %p our.bowl)]/saxo/[(scot %da now.bowl)]/[(scot %p who)]
    ==
  ::
  --
::
  ::
::
++  init
  ^+  cor
  cor
::
++  save
  ^-  vase
  !>  ~
::
++  load
  |=  vaz=vase
  ^+  cor
  init
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

