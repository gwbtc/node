/-  *observatory
|_  dat=comets
::
++  grab
  |%
  ++  noun  comets
  --
++  grow
  |%
  ++  noun  dat
  ++  json
    ^-  ^json
    [%a (turn dat entry-json)]
  --
++  grad  %noun
::
++  object
  |=  fields=(list [@t json])
  ^-  json
  [%o (~(gas by *(map @t json)) fields)]
::
::  Render ship names as @p text and nyms as their stored text.
++  comet-json
  |=  who=comet
  ^-  json
  %-  object
  :~  ['patp' [%s (scot %p patp.who)]]
      ['nym' [%s nym.who]]
  ==
::
::  Preserve list order; an absent sponsor becomes JSON null.
++  entry-json
  |=  [who=comet sponsor=(unit comet)]
  ^-  json
  %-  object
  :~  ['patp' [%s (scot %p patp.who)]]
      ['nym' [%s nym.who]]
      ['sponsor' ?~(sponsor ~ (comet-json u.sponsor))]
  ==
--
