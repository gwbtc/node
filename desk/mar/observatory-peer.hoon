|_  per=peer-state:ames
::
++  grab
  |%
  ++  noun  peer-state:ames
  --
++  grow
  |%
  ++  noun  per
  ++  json
    ^-  ^json
    ::  Display projection: session keys, message contents, ducts and
    ::  authentication-chain keys remain internal to the noun form.
    %-  object
    :~  ['life' (decimal life.per)]
        ['rift' (decimal rift.per)]
        ['sponsor' [%s (scot %p sponsor.per)]]
        ['pass' [%s (scot %ux pass.per)]]
        ['public-keys' public-keys-json]
        ['fief' ?~(fief.per ~ (fief-json u.fief.per))]
        ['route' ?~(route.per ~ (route-json u.route.per))]
        ['qos' qos-json]
        ['flows' flows-json]
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
::  Unix seconds, matching the Bitcoin explorer's existing JSON marks.
::  Unset/pre-epoch timestamps become null rather than underflowing.
++  timestamp
  |=  date=@da
  ^-  json
  ?:  (lth date ~1970.1.1)  ~
  (decimal (div (sub date ~1970.1.1) ~s1))
::
++  public-keys-json
  ^-  json
  %-  object
  :~  ['cry' [%s (scot %ux cry.public-keys.per)]]
      ['sgn' [%s (scot %ux sgn.public-keys.per)]]
  ==
::
::  For %unborn, the timestamp means tracking began, not contact.
++  qos-json
  ^-  json
  %-  object
  :~  ['status' [%s (scot %tas -.qos.per)]]
      ['last-contact' ?:(?=(%unborn -.qos.per) ~ (timestamp last-contact.qos.per))]
      ['tracking-started' ?:(?=(%unborn -.qos.per) (timestamp last-contact.qos.per) ~)]
  ==
::
++  flows-json
  ^-  json
  %-  object
  :~  ['sending' (decimal ~(wyt by snd.per))]
      ['receiving' (decimal ~(wyt by rcv.per))]
      ['remote-scries' (decimal ~(wyt by keens.per))]
      ['closing' (bones-json closing.per)]
      ['corked' (bones-json corked.per)]
      ['halted' (bones-json halt.per)]
      ['nacks' (decimal ~(wyt in nax.per))]
  ==
::
++  bones-json
  |=  bones=(set bone:ames)
  ^-  json
  [%a (turn ~(tap in bones) decimal)]
::
++  route-json
  |=  rut=[direct=? lane=lane:ames]
  ^-  json
  %-  object
  :~  ['direct' [%b direct.rut]]
      ['lane' (lane-json lane.rut)]
  ==
::
::  Legacy Ames lanes are either a relay ship or a packed address atom;
::  preserve the latter as hex rather than a lossy JavaScript number.
++  lane-json
  |=  lan=lane:ames
  ^-  json
  ?-  -.lan
    %&  (object ~[['type' [%s 'ship']] ['ship' [%s (scot %p p.lan)]]])
    %|  (object ~[['type' [%s 'address']] ['address' [%s (scot %ux p.lan)]]])
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
::  Keep each turf's labels in their native TLD-first order.
++  turf-json
  |=  dom=turf
  ^-  json
  :-  %a
  (turn dom |=(@t [%s +<]))
--
