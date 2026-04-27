/-  *bitcoin-common
|%
::
+$  node-config
  $:  url=@t
      auth=@t
  ==
::
++  make-request-card
  |=  [wir=wire req=request:http]
  ^-  card
  :*  %pass  wir  %arvo  %i  %request  req  *outbound-config:iris
  ==
::
++  rest
  |%
  +$  request
    $%  [%block-hash =block-height]
        [%block =block-hash]
    ==
  ::
  ++  make-request
    |=  [wir=wire fig=node-config req=request]
    %+  make-request-card  wir
    ^-  request:http
    =;  url  [%'GET' url ~ ~]
    ^-  cord
    %+  rap  3
    :+  url.fig  '/rest'
    ^-  (list cord)
    ?-  -.req
      %block       ['/block/' (en:base16:mimes:html 32 block-hash.req) '.bin' ~]
      %block-hash  ['/blockhashbyheight/' (crip ((d-co:co 1) block-height.req)) '.bin' ~]
    ==
  ::
  --
::
++  json-rpc
  |%
  +$  request
    $%  [%get-block-count ~]
        [%get-block-hash =block-height]
        [%get-block-header =block-hash]
        [%get-block-atom =block-hash]
        [%get-transaction =block-hash =txid]
    ==
  +$  response
    $%  [%get-block-count =block-height]
        [%get-block-hash =block-hash]
        [%get-block-header =block-header]
        [%get-block-atom =block]
        [%get-transaction =transaction]
    ==
  ::
  ++  make-request
    |=  [wir=wire fig=node-config req=request]
    %+  make-request-card  wir
    ^-  request:http
    =/  dat  [~ (as-octs:mimes:html (en-json-rpc req))]
    =/  aut  (en:base64:mimes:html (met 3 auth.fig) auth.fig)
    =;  hed
        [%'POST' url.fig hed dat]
    :~  ['Content-Type' 'application/json']
        ['Authorization' (cat 3 'Basic ' aut)]
    ==
  ::
  ++  handle-response
    |=  res=client-response:iris
    ^-  (unit response)
    ?.  ?=([%finished * ^] res)  ~
    :-  ~
    %-  de-json-rpc  q.data.u.full-file.res
  ::
  ++  en-json-rpc
    |=  req=request
    ^-  cord
    %-  en:json:html
    ^-  json
    ?-  -.req
    ::
        %get-block-count
      %:  make-request-object  -.req  %getblockcount
          ~
      ==
    ::
        %get-block-hash
      %:  make-request-object  -.req  %getblockhash
      :~  [%n (crip ((d-co:co 1) block-height.req))]
      ==  ==
    ::
        %get-block-header
      %:  make-request-object  -.req  %getblockheader
      :~  [%s (en:base16:mimes:html 32 block-hash.req)]
      ==  ==
    ::
        %get-block-atom
      %:  make-request-object  -.req  %getblock
      :~  [%s (en:base16:mimes:html 32 block-hash.req)]
          [%n '0']  :: least verbosity
      ==  ==
    ::
        %get-transaction
      %:  make-request-object  -.req  %getrawtransaction
      :~  [%s (en:base16:mimes:html 32 txid.req)]
          [%b &]  :: full verbosity
          [%s (en:base16:mimes:html 32 block-hash.req)]
      ==  ==
    ::
    ==
  ::
  ++  de-json-rpc
    |=  cod=cord
    ^-  response
    =/  jon  (need (de:json:html cod))
    ?+  jon  !!
    ::
        [%o *]
      =/  dej  ~(. dj jon)
      =/  ver  t:(got:dej 'jsonrpc')
      =/  tag  t:(got:dej 'id')
      ?:  (has:dej 'error')
        =/  erj  (got:dej 'error')
        ~&  >>>  [%bitcoin-rpc-error tag]
        =/  cod  t:(got:erj 'code')
        =/  mes  t:(got:erj 'message')
        ~&  >>>  [%code cod]
        ~&  >>>  [%message mes]
        !!
      =/  res  (got:dej 'result')
      ?+  tag  !!
        %get-block-count   [tag ud:res]
        %get-block-hash    [tag ux:res]
        %get-block-header  [tag (json-to-block-header jo:res)]
        %get-block-atom    [tag ux:res]
        %get-transaction   [tag (json-to-transaction jo:res)]
      ==
    ::
        [%a *]
      !!
    ::
    ==
  ::
  +$  method
    $?  %getblockcount
        %getblockhash
        %getblockheader
        %getblock
        %getrawtransaction
    ==
  ::
  ++  make-request-object
    |=  $:  req-tag=@tas
            =method
            params=(list json)
        ==
    ^-  json
    :-  %o
    %-  malt
    ^-  (list [@t json])
    :~  ['jsonrpc' [%s '2.0']]
        ['id' [%s req-tag]]
        ['method' [%s method]]
        ['params' [%a params]]
    ==
  ::
  ++  json-to-block-header
    |=  jon=json
    ^-  block-header
    =/  dej  ~(. dj jon)
    :*  ux:(got:dej 'version')
        ?.  (has:dej 'previousblockhash')  0x0
        ux:(got:dej 'previousblockhash')
        ux:(got:dej 'merkleroot')
        ud:(got:dej 'time')
        ux:(got:dej 'bits')
        ux:(got:dej 'nonce')
    ==
  ::
  ++  json-to-transaction
    |=  jon=json
    ^-  transaction
    =/  dej  ~(. dj jon)
    :*  ux:(got:dej 'version')
        ud:(got:dej 'locktime')
        %+  murn  li:(got:dej 'vin')
        |=  jom=json
        ^-  (unit transaction-input)
        =.  dej  ~(. dj jom)
        ?:  (has:dej 'coinbase')  ~
        :-  ~
        :*  ux:(got:dej 'txid')
            ud:(got:dej 'vout')
            ux-b:(got:(got:dej 'scriptSig') 'hex')
            ux:(got:dej 'sequence')
            ?.  (has:dej 'txinwitness')  ~
            %+  turn  li:(got:dej 'txinwitness')
            |=  j=json
            %~  ux-b  dj  j
        ==
        %+  turn  li:(got:dej 'vout')
        |=  jom=json
        ^-  transaction-output
        =.  dej  ~(. dj jom)
        =/  sat  t:(got:dej 'value')
        =/  pub  (got:dej 'scriptPubKey')
        :-  (scan (skip (trip sat) |=(c=@t =('.' c))) dem)
            ux-b:(got:pub 'hex')
    ==
  ::
  --
::
++  dj
  |_  jon=json
  ++  dj-cor  .
  ::
  ++  got
    |=  key=@t
    ?>  ?=([%o *] jon)
    %_  dj-cor
      jon  (~(got by p.jon) key)
    ==
  ::
  ++  has
    |=  key=@t
    ?>  ?=([%o *] jon)
    %-  ~(has by p.jon)  key
  ::
  ++  jo  jon
  ::
  ++  ob
    ^-  (map @t json)
    ?>  ?=([%o *] jon)  p.jon
  ::
  ++  li
    ^-  (list json)
    ?>  ?=([%a *] jon)  p.jon
  ::
  ++  t
    ^-  @t
    ?+  jon  !!
      [%s *]  p.jon
      [%n *]  p.jon
      [%b *]  (scot %f p.jon)
      ~  ''
    ==
  ::
  ++  ud
    ^-  @ud
    ?>  ?=([%n *] jon)
    %+  rash  p.jon  dem
  ::
  ++  ux
    ^-  @ux
    ?>  ?=([%s *] jon)
    =<  q
    %-  need
    %-  de:base16:mimes:html
        p.jon
  ::
  ++  ux-b
    ^-  hexb
    ?>  ?=([%s *] jon)
    %-  need
    %-  de:base16:mimes:html
        p.jon
  ::
  ++  da
    ^-  @da
    ?>  ?=([%n *] jon)
    %-  from-unix:chrono:userlib
    %+  rash  p.jon  dem
  ::
  --
::
--

