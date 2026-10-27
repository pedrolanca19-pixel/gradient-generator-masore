# Plano — Gradient Generator (Masore)

Estado: **só plano**, a aguardar respostas às perguntas abertas (secção 8) antes de começar a implementação.

## 1. O que as referências têm em comum

| Ref | O que se vê | Efeito técnico |
| --- | --- | --- |
| Fractal Haze | Bandas azul/branco/preto vistas através de vidro canelado vertical | Campo de cor em ondas + refração em faixas verticais |
| Vitrium Opus | Brilho central em fundo preto, faixas com franjas arco-íris e grão forte | Refração em faixas + aberração cromática + grão |
| Fluency | Pinceladas azuis curvas com bordas serrilhadas, "arrastadas" | Campo em ondas + arrasto direcional com dentes (sawtooth) + grão |
| Pixelity | Faixas diagonais azuis com transições suaves e bordas nítidas | Bandas lineares diagonais em degraus, sem distorção |
| Atribra | Fitas diagonais verde-lima → azul, com volume, sobre preto | Bandas diagonais + refração/torção ao longo de cada fita |

**Conclusão:** todas as imagens saem da mesma receita em 3 camadas:

1. **Campo de cor**: um gradiente (paleta) moldado por uma forma: bandas/ondas, faixas diagonais ou brilho radial.
2. **Distorção**: vidro canelado (faixas que refratam o campo), arrasto serrilhado, torção.
3. **Acabamento**: aberração cromática, desfoque, grão, contraste, vinheta.

O fundo escuro é o **Background** do Toolcraft (cor configurável e transparência no PNG).

## 2. A app

Um gerador procedural, sem upload de imagem. Escolhes um preset parecido com uma das referências, ajustas os parâmetros e exportas em alta resolução (as referências têm cerca de 4000 px; a exportação vai até 8K).

### Secções do painel (ordem final)

0. **Settings** (do Toolcraft): Background + cor de fundo, Infinity canvas, proporção e tamanho, Resolution scale.
1. **Presets**: botões `actions` que aplicam um conjunto de valores (Haze, Vitrium, Fluency, Pixelity, Ribbon) e o botão **Aleatório** (nova semente).
2. **Cor**, com o título "Paleta" (não se pode usar "Color"): controlo `gradient` (stops, tipo, ângulo) e `segmented` de mapeamento (Suave / Degraus) para o look Pixelity.
3. **Forma**: `select` com Bandas / Diagonais / Brilho, mais Escala, Frequência das ondas, Rotação, Posição (`vector`, move o brilho/bandas no sentido do gesto) e Semente.
4. **Vidro canelado**: Faixas (quantidade), Ângulo das faixas, Refração, Perfil (Curvo / Plano / Prisma), Brilho das arestas.
5. **Arrasto**: Intensidade, Direção, Serrilhado (tamanho dos dentes).
6. **Acabamento**: Aberração cromática, Desfoque, Grão (quantidade e tamanho), Contraste, Vinheta.
7. **Image Export**: PNG/JPG e 2K/4K/8K, mais o botão fixo **Export PNG**.

Cada controlo declara `applicability`. Os controlos que só fazem sentido numa forma (por exemplo Frequência só para Bandas) ficam escondidos quando não se aplicam, mas o valor guarda-se. Não há "modos" de app, porque não os pediste.

## 3. Renderer

- **Um único shader de fragmento** (passo `render`, sem estado, sem feedback), que calcula campo → distorção → acabamento por pixel. Corre na GPU em tempo real e só redesenha quando um valor muda.
- **Backend:** pelo contrato do Toolcraft, um renderer GPU novo usa **WebGPU via VGPU** (`provider: "vgpu"`, `app-pinned`), ativado com o comando do Toolcraft antes de escrever o shader. Se o Chromium headless deste contentor não suportar WebGPU, documento a exceção `browser-compatibility` e uso WebGL nativo. Isso só se decide depois de testar.
- **Preview e export usam o mesmo shader:** o `rasterFrameRenderer` desenha o mesmo frame à resolução escolhida. O grão é determinístico (por semente), por isso o export é igual ao preview.
- **Infinity canvas:** o campo é procedural e infinito. O `sceneBoundsProvider` devolve o retângulo do artboard e o passo declara-se `intrinsic` (o padrão preenche o enquadramento escolhido).
- `viewInteraction: non-spatial` (é uma imagem 2D, sem cena 3D). Não há layers.

## 4. Performance (planeamento obrigatório antes do código)

- A carga de trabalho é proporcional aos pixels (tamanho do canvas × Resolution scale) e ao número de amostras do desfoque e da aberração. Cada dimensão fica declarada com o seu máximo no `workloadEnvelope`.
- O pipeline fica registado em `renderer.pipelineRegistration`. Corro `assessToolcraftRenderPlan` antes de escrever o renderer.
- Pan e zoom não recalculam o shader (transformação do viewport). Sliders redesenham em cada frame do gesto.

## 5. Ficheiros

- `src/app/app-schema.ts`: secções e controlos acima, mais `appControlSectionInventory`.
- `src/app/app-composition.tsx`: ligar `scene.canvasContent`, `rasterFrameRenderer`, `sceneBoundsProvider`, `pipelineRegistration` e `onPanelAction` (presets/aleatório).
- `src/app/gradient/` (novo): `shader` (WGSL/GLSL), `renderer.tsx` (usa `useToolcraftProductSceneFrame`), `presets.ts`, `pipeline.ts` e testes unitários.
- `src/app/app-acceptance-data.ts`: passar a `mode: "product"`, com `exportIntent` (imagem `toolcraft-default`, SVG e vídeo `not-requested`), `interactionOwnership` e `viewInteraction`.
- `src/app/app-performance.ts`: envelope, caminhos e fixtures.
- `e2e/`: testes de browser da app (presets, cada secção, export PNG 2K/4K/8K, persistência, render scale).
- `docs/toolcraft/agent-worklog.md`: passar a `Mode: product` e registar as decisões.
- Capa da app (`app-cover.json` + imagem) gerada a partir de uma composição real.

## 6. Ordem de trabalho

0. **Desbloquear os testes:** o `npm test` falha porque o instalador criou symlinks em `.claude/skills`. Resolvo isto (copiar os ficheiros em vez de usar links, ou regenerar com `--no-skills`) sem tocar em ficheiros protegidos.
1. Ativar o provider GPU e confirmar que corre no browser headless.
2. Declarar o envelope, o pipeline e o assessment de performance.
3. Escrever o shader em camadas (campo → vidro → arrasto → acabamento), com testes unitários das funções puras.
4. Escrever o schema, as secções e os presets afinados contra as 5 referências.
5. Ligar a exportação PNG/JPG e testar 2K/4K/8K.
6. Fazer a verificação visual no browser e afinar os presets até se aproximarem das referências.
7. Fazer a capa, o worklog e a entrega.

## 7. Verificação

```
Verification tier: Tier 4
Reason: primeira entrega de produto com renderer GPU novo, schema e export.
Run: testes unitários do shader/presets; npm run test:feature por secção durante o desenvolvimento;
     npm run verify:delivery uma vez no fim; npm run dev para pré-visualização.
Skip: performance medida (verify:perf), que só corre se a pedires.
```

## 8. Perguntas antes de começar

1. **Animação:** queres só imagens estáticas, ou também movimento (as ondas e o brilho a mexer em loop)? Animação acrescenta a timeline do Toolcraft.
2. **Vídeo:** queres exportar vídeo (MP4/WebM)? O Toolcraft só o adiciona se o pedires explicitamente.
3. **Texto e logo:** as referências têm tipografia por cima. A app deve só gerar o fundo (recomendado; o texto faz-se depois no Figma), ou queres poder pôr texto/logo?
4. **Imagem própria:** queres também poder carregar uma foto e aplicar-lhe o vidro canelado e o grão, ou chega o gerador procedural?
5. **Formato inicial:** começo em 1:1 (como a maioria das referências) ou noutro formato (4:5, 16:9…)?
