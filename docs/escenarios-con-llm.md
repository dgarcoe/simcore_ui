# Generar un escenario con un LLM

Simcore tiene una referencia completa de su YAML pensada para pasársela a un LLM:
[scenario-reference.md](https://github.com/dgarcoe/simcore/blob/ccca2bc90490f6ca12ca38142df51a6b237ba465/docs/scenario-reference.md).

El enlace apunta a la versión de Simcore que usa esta UI (`SIMCORE_REF`). La referencia incluye:
- todas las claves, con su tipo, valor por defecto y rango;
- el lenguaje de consecuencias;
- lo que el motor ya hace solo;
- los errores típicos;
- un ejemplo completo.

Un test del fork comprueba que no falta ningún campo.

## Pasos

1. Abre una conversación con el LLM (cuanto más capaz, mejor; los escenarios largos necesitan un modelo grande).
2. Pégale **la referencia** (el fichero entero), **esta guía** (las pistas del mapa de abajo) y **el prompt**, con tu idea rellenada.
3. Copia el YAML que devuelva y guárdalo como `config.yaml`.
4. En la UI, entra en «Crear escenario» y pulsa «Importar». El editor valida el escenario y lista los problemas: lugares, estados o acciones que no existen, rangos fuera de límite… Si hay alguno, pásale al LLM la lista tal cual y pídele que lo corrija.
5. Pruébalo en **demo** (sin LLM, va rápido) con varias semillas (`simulation.seed`), para ver que cada final puede ocurrir y que el ritmo funciona. Después, lánzalo con el LLM de verdad.

También puedes probarlo sin la UI:

```bash
python -m simcore.cli run config.yaml --demo --headless --speed 0
```

## Prompt

```text
You are writing a scenario for Simcore, a social simulation engine where each character is an LLM agent.
Follow the attached "Simcore scenario reference" exactly and the "Pixel UI hints" below.
Output only the YAML document, nothing else.

Idea: <describe the story: setting, conflict, what can go right and wrong>
Language of all story text: <es | en | pt…>   (simulation.language)
Duration: <e.g. 3 days>, time step: <e.g. 1 hour>
Cast: <e.g. 8 agents>; give them conflicting goals, relationships, at least one secret and one false belief.
Systems to use: <e.g. conditions with contagion, needs, items, recipes (actions that need items
  gathered from several places and are done at one place), scenario actions, world rules,
  factions, a vote, routines, rpg, story, scores (achievements agents go for), cursed items,
  stealing (steal: one | all)>
Endings: at least <2> rules that end the run (one good, one bad), reachable within the duration;
  use "{winner}" in an ending's text to name who won, and when.any for several ways to win.
Map theme: <town | city | spaceship | warehouse | factory | space-battle>

Before answering, check every cross-reference (places, conditions, actions, needs, agents, groups)
and quote boolean-like YAML keys ("sí", "no", "yes").
```

## Pistas para el mapa pixel

El mapa se genera a partir del escenario, así que conviene que el LLM:
- **Tema:** lo fije con `environment.global_state.ui_theme`: `town`, `city` (ciudad estilo GTA), `spaceship`, `warehouse`, `factory` o `space-battle`.
- **Posiciones:** dé a cada lugar una `position` en una cuadrícula de unos 12×12, con los lugares relacionados cerca y sin repetir coordenadas. Los caminos se trazan entre vecinos.
- **Tipos de lugar:** use `type` reconocibles: `residential`, `healthcare`, `commercial`, `public`, `religious`, `military`, `farm`, `industrial`, `storage`, `engineering`, `government`, `education`, `outdoor`. Si el nombre no lo deja claro, puede fijar el rol en `properties.ui_role`: `medical`, `commerce`, `storage`, `production`, `engineering`, `command`, `quarters`, `social`, `education`, `agriculture`, `leisure`, `transit`, `combat`, `generic`.
- **Tamaño:** ajuste `capacity` a lo que es el lugar. Las zonas crecen con la capacidad y con la gente que empieza allí.
- **Profesiones:** escriba profesiones concretas (médica, guardia civil, granjero, ingeniera…). Deciden la ropa, el casco o el sombrero de cada agente.
- **Recursos:** use nombres reconocibles en los recursos de los agentes y las existencias de los lugares: `medicina` (botiquín), `dinero` (caja fuerte), `comida`, `agua` o `combustible` (barril), `piezas` (cajas).
- **Colores:** dé un `color` a cada estado (`#7bc950` para zombi, `#b13e53` para herido) y a cada grupo, porque se ven en el mapa.

## Antes de importar

- [ ] Solo YAML, sin texto alrededor.
- [ ] Todos los nombres citados existen y están escritos igual.
- [ ] Las claves `"sí"` y `"no"` de las votaciones van entre comillas.
- [ ] Hay al menos dos reglas con `end:` que pueden cumplirse antes de que acabe `duration`.
- [ ] Hay presión desde el principio (una necesidad, un peligro, una variable que baja) y sucesos programados que escalan.
- [ ] Hay pocas acciones de escenario, solo las propias de la historia: atacar, curar, buscar, susurrar, votar o fundar grupos ya vienen de serie.
- [ ] Con `rpg: true`, los protagonistas tienen `attributes` y `skills`, y las acciones clave tienen `check`.

Para algo que haya que **construir o reparar juntando piezas** («crafteo»), pide una acción con `who.items` y `cost` (las piezas), `where` (el lugar donde se hace) y `world` u `on_self.items` (lo que se consigue), con las piezas repartidas entre lugares y personajes (patrón «Crafting / recipes» de la referencia). A los agentes se les dice qué les falta y dónde está. La radio de `zombie-siege` es el ejemplo.

Para un escenario en el que **solo puede ganar uno**, pide un objeto `visible` y `drops` y una regla `holds` con `{holder}` en el final (patrón «King of the hill» de la referencia); `valdemora-ring` es el ejemplo.

Otros sistemas que se le pueden pedir (todos en la referencia; `valdemora-ring` los usa):
- **Puntos y logros** (`scores`): puntos por hacer acciones, visitar lugares, llevar un objeto o seguir vivo, y en contra por pasar tiempo sin hacer algo. Los agentes ven su marcador y van a por ellos; una regla puede acabar al llegar a unos puntos (`when: {score: {gte: 40}}`).
- **Varias maneras de ganar** en una regla (`when: {any: [...]}`) y `{winner}` en el texto del final para nombrar al ganador (quien guarda el objeto, quien llega a los puntos, el último en pie o el que más puntos tenga).
- **Objetos malditos** (`curse`): un estado mientras se lleva (daño por turno o una mente cambiada), `sticky` para que no se pueda soltar, y `broken_by` con el objeto o la acción que rompe la maldición.
- **Robos** (`on_target: {steal: one | all}`) y objetos que aparecen con un suceso (`items: {"location:X": {objeto: 1}}`), que se anuncian a quien está allí, y a todos si el objeto es `visible`.
- **Grupos con ventajas** (`society.group_perks`, activado por defecto): ayuda en las tiradas, defensa mutua y un almacén común.
- **Territorios** (`territory: true` e `income` en los lugares, `territories`, `when: {territories: {gte, ticks}}`): barrios que se disputan los grupos; `winner: group` y `{mvp}` para un final con banda y persona ganadoras; `society.lethal: false` para que nadie muera (K.O.). `los-santos` es el ejemplo.
- **Órdenes de los jugadores** (`agents[].orders`) y `simulation.pause_each_day` para partidas por jornadas.

Los escenarios de `scenarios/` sirven de modelo: `zombie-siege`, `kepler-station`, `zombie-outbreak`, `valdemora-ring`, `los-santos` y `last-night`.
