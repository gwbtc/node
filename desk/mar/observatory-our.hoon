/-  *observatory
|_  dat=our-data
::
++  grab
  |%
  ++  noun  our-data
  --
++  grow
  |%
  ++  noun  dat
  ++  json
    ^-  ^json
    %-  object
    :~  ['patp' [%s (scot %p patp.who.dat)]]
        ['nym' [%s nym.who.dat]]
        ['custody' [%a (turn custody.dat entry-json)]]
    ==
  --
++  grad  %noun
::
++  object
  |=  fields=(list [@t json])
  ^-  json
  [%o (~(gas by *(map @t json)) fields)]
::
++  decimal
  |=  num=@ud
  ^-  json
  [%n (crip ((d-co:co 1) num))]
::
::  Fixed-width hex strings preserve hashes and keys without JS rounding.
++  hex
  |=  [wid=@ud val=@ux]
  ^-  json
  [%s (en:base16:mimes:html wid val)]
::
::  Preserve oldest-first custody order; plain moves have a null opening.
++  entry-json
  |=  ent=gw-custody-entry
  ^-  json
  %-  object
  :~  ['txid' (hex 32 txid.ent)]
      ['height' (decimal height.ent)]
      ['opening' ?~(opening.ent ~ (opening-json u.opening.ent))]
  ==
::
++  opening-json
  |=  opn=gw-opening
  ^-  json
  %-  object
  :~  ['internal-key' (hex 33 internal-key.opn)]
      ['snapshot' (snapshot-json snapshot.opn)]
      ['spawn-opening' ?~(spawn-opening.opn ~ (spawn-opening-json u.spawn-opening.opn))]
  ==
::
++  snapshot-json
  |=  snap=gw-snapshot
  ^-  json
  %-  object
  :~  ['life' (decimal life.snap)]
      ['rift' (decimal rift.snap)]
      ['key' (hex 32 key.snap)]
      ['sponsor' ?~(sponsor.snap ~ [%s (scot %p u.sponsor.snap)])]
      ['fief' ?~(fief.snap ~ (fief-json u.fief.snap))]
  ==
::
++  spawn-opening-json
  |=  opn=[spawn=gw-satpoint start-height=@ud]
  ^-  json
  %-  object
  :~  ['spawn' (satpoint-json spawn.opn)]
      ['start-height' (decimal start-height.opn)]
  ==
::
++  satpoint-json
  |=  sat=gw-satpoint
  ^-  json
  %-  object
  :~  ['txid' (hex 32 txid.sat)]
      ['vout' (decimal vout.sat)]
      ['off' (decimal off.sat)]
  ==
::
++  fief-json
  |=  fie=fief
  ^-  json
  ?-  -.fie
      %turf
    %-  object
    :~  ['type' [%s 'turf']]
        ['domains' [%a (turn p.fie turf-json)]]
        ['port' (decimal q.fie)]
    ==
      %if
    %-  object
    :~  ['type' [%s 'ipv4']]
        ['address' [%s (scot %if p.fie)]]
        ['port' (decimal q.fie)]
    ==
      %is
    %-  object
    :~  ['type' [%s 'ipv6']]
        ['address' [%s (scot %is p.fie)]]
        ['port' (decimal q.fie)]
    ==
  ==
::
::  Labels remain in their native TLD-first order, as in observatory-peer.
++  turf-json
  |=  dom=turf
  ^-  json
  :-  %a
  (turn dom |=(@t [%s +<]))
--
