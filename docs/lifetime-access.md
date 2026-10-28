# Pulse Lifetime Access — schválený model

**Cena: 1 USD jednorázově, ne měsíčně.** Jeden nákup přidělí uživateli permanentní oprávnění k aktivním nástrojům Pulse Studio. Žádné subscription, další platby, automatické obnovování ani měsíční limity.

## Uživatelský průchod

1. Návštěvník uvidí veřejný startscreen Pulse se symbolikou 3 × 3 kruhů, logem s červenou tečkou a cenou **$1 ONE TIME**.
2. Vloží e-mail; pomocí Supabase Auth dostane jednorázový přihlašovací odkaz (magic link).
3. Po přihlášení vybere **Unlock Pulse — $1 once** a je přesměrován na Stripe Checkout (`mode=payment`, částka `100` v USD centech).
4. Po úspěšné platbě Stripe odešle podepsaný webhook; až pak server přidělí `lifetime_access=true` uživatelskému ID. Návratová stránka ani klientský JavaScript samy o sobě nesmějí přístup aktivovat.
5. Při další návštěvě se uživatel přihlásí stejným e-mailem; server ověří nárok. Bez dalších plateb.

## Pravidla

- Jeden produkt: **Pulse Lifetime Access ($1 one-time)**.
- Zahrnuje BPM Analyzer, Converter, Key Finder a Loop Cutter.
- YouTube Audio zůstává neaktivní **Coming soon**, dokud nebude zprovozněno; nesmí se vydávat za hotovou funkci.
- Neomezené lokální analýzy/exporty stávajících nástrojů.
- Při refundaci nebo chargebacku je třeba serverově odebrat oprávnění, při opakovaném doručení webhooku nesmí vzniknout duplicita.
- Ukončení provozu služby a právní formulaci „lifetime“ definovat v podmínkách srozumitelně; vhodné je „po dobu provozu služby“, ne neomezená garance provozu po všechny budoucí roky.
- Karta ani platební údaje se neukládají v Pulse, jen ve Stripe.
- Reálné ceny a daně ověřit před zveřejněním; u $1 může fixní transakční poplatek představovat velkou část výnosu.

## Bezpečnost implementace

Současná Pulse aplikace je statické HTML se zabalenou JavaScriptovou logikou. Pouhé CSS skrytí nástrojů a tlačítko „Pay now“ **není zabezpečený paywall**. Před aktivací produkce je nutné:

- Vystavit veřejně jen paywall, nikoli celý zabalený analyzátor.
- Předat studio z chráněného endpointu až po ověření přihlášení a trvalého oprávnění na serveru.
- Ověřovat autentizační token na serveru, nikoliv status z `localStorage`.
- Stripe API klíče, Supabase service role a webhook secret uchovávat pouze v serverových env vars na Vercelu. Do veřejného GitHubu nikdy nevkládat tajné hodnoty.
- Počítat s tím, že samotný repozitář je veřejný; uživatel může zkopírovat dostupný zdrojový kód. Soukromý repozitář pomůže se zveřejňováním kódu, ale nezabrání všem formám kopírování webových nástrojů.

## Stav

`prototype/lifetime-access/index.html` je pouze vizuální první návrh. Tlačítko je **záměrně neaktivní** a nic nestrhává. Platební účet Stripe, projekt Supabase a bezpečné serverové endpointy zatím nejsou napojené. Veřejný web Pulse se nesmí bez dokončení těchto kroků zamknout.