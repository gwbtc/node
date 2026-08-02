/-  *bitcoin-light-client
|_  bes=best-block:update
::
++  grab
  |%
  ++  noun  best-block:update
  --
++  grow
  |%
  ++  noun  bes
  ++  json
    ^-  ^json
    ?-  -.bes
    ::
        %new
      :-  %o
      %-  ~(gas by *(map @t ^json))
      :~  ['block-height' %n (crip ((d-co:co 1) block-height.bes))]
          ['block-hash' %s (en:base16:mimes:html 32 block-hash.bes)]
      ==
    ::
        %reorg-rollback
      :-  %o
      %-  ~(gas by *(map @t ^json))
      :~  ['block-height' %n (crip ((d-co:co 1) block-height.bes))]
          ['block-hash' %s (en:base16:mimes:html 32 block-hash.bes)]
      ==
    ::
    ==
  --
++  grad  %noun
--

