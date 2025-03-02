# CNC Sinumerik Editor

Webová aplikace pro editaci a simulaci CNC Sinumerik programů.

## Funkce

- Split-pane rozhraní pro editaci a parsování
- Dotykově přívětivý design
- Podpora souborů .mpf a .spf
- Responsivní layout
- Panel pro výběr programů
- Simulátor CNC programů (ve vývoji)

## Použití

Otevřete `editor_cnc.html` v moderním webovém prohlížeči. Použijte výběr souborů pro načtení CNC programů.

## Instalace a spuštění

```bash
# Nainstalovat závislosti
npm install

# Spustit vývojový server
npm run dev

# nebo vytvořit produkční build
npm run build
```

Pro lokální vývoj navštivte `http://localhost:5173`

## Řešení problémů

1. Pokud se stránka nenačítá:

   - Vyčistěte cache prohlížeče
   - Zkontrolujte konzoli prohlížeče pro chyby
   - Ujistěte se, že běží npm run dev

2. Pokud nejsou načteny styly/skripty:
   - Zkontrolujte cesty v index.html
   - Ujistěte se, že všechny soubory existují ve správných složkách

## Aktuální stav

- Editor: Základní funkce implementovány
- Simulátor: Ve vývoji

## Plánované funkce

- Parser CNC kódu
- Simulace drah nástroje
- Podpora MPF a SPF souborů
