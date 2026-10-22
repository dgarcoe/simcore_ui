# Generar un escenario con un LLM

Simcore tiene una referencia completa de su YAML pensada para pasársela a un LLM:
[scenario-reference.md](https://github.com/dgarcoe/simcore/blob/b8abbbcb15d32786896437555d2427ec80559bd9/docs/scenario-reference.md).

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
Systems to use: <e.g. conditions with contagion, needs, items, scenario actions, world rules,
  factions, a vote, routines, rpg, story>
Endings: at least <2> rules that end the run (one good, one bad), reachable within the duration.
Map theme: <town | spaceship | warehouse | factory | space-battle>

Before answering, check every cross-reference (places, conditions, actions, needs, agents, groups)
and quote boolean-like YAML keys ("sí", "no", "yes").
```

## Pistas para el mapa pixel

El mapa se genera a partir del escenario, así que conviene que el LLM:
- **Tema:** lo fije con `environment.global_state.ui_theme`: `town`, `spaceship`, `warehouse`, `factory` o `space-battle`.
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

Para un escenario en el que **solo puede ganar uno**, pide un objeto `visible` y `drops` y una regla `holds` con `{holder}` en el final (patrón «King of the hill» de la referencia); `valdemora-seal` es el ejemplo.

Los escenarios de `scenarios/` sirven de modelo: `zombie-siege`, `kepler-station`, `zombie-outbreak` y `last-night`.
