/**
 * @moonstage/core public API. Everything exported here is a contract other
 * packages, plugins and tools may rely on. Anything not exported is internal.
 */

export { PROJECT_FORMAT, PLUGIN_API, MIN_PLUGIN_API, BEHAVIOR_ABI, MIN_BEHAVIOR_ABI } from "./versions.js";
export {
  DIAGNOSTIC_CODES,
  diagnostic,
  hasErrors,
  MoonstageError,
  type Diagnostic,
  type DiagnosticCode,
  type DiagnosticCodeInfo,
  type Severity,
} from "./diagnostics.js";
export { SCHEMAS, projectSchema, sceneSchema, operationSchema, testSchema } from "./schema/schemas.js";
export { validateSchema, type JsonSchema, type SchemaIssue } from "./schema/validate.js";
export {
  validateManifestShape,
  validateSceneShape,
  validateTestShape,
  validateProjectSemantics,
  inputNames,
  behaviorsOf,
  isImageAsset,
  isAudioAsset,
  TEXT_BINDING,
  type ProjectManifest,
  type BehaviorModuleDecl,
  type SceneSource,
  type EntitySource,
  type PrefabSource,
  type Components,
  type TransformComponent,
  type ShapeComponent,
  type TextComponent,
  type BehaviorComponent,
  type CameraComponent,
  type PhysicsBodyComponent,
  type ColliderComponent,
  type JointComponent,
  PHYSICS_COMPONENTS,
  type SpriteComponent,
  type AssetDecl,
  type TestSource,
  type Assertion,
  type Comparison,
  type Vec2,
} from "./project.js";
export { applyOperation, applyOperations, parsePropertyPath, type Operation } from "./operations.js";
export { World, TRANSFORM_FIELDS, type Entity, type Transform } from "./world.js";
export { InputState, KeyBindings } from "./input.js";
export { createRandom, type Random } from "./random.js";
export { type Matrix, IDENTITY, multiply, compose, apply } from "./math.js";
export {
  HOST_FUNCTIONS,
  REQUIRED_EXPORTS,
  instantiateBehavior,
  behaviorInterface,
  type BehaviorExports,
  type BehaviorImports,
  type BehaviorBinary,
  type BehaviorFactory,
  type BehaviorSource,
  type BehaviorInterface,
  type HostFunctions,
  type WasmApi,
} from "./behavior.js";
export {
  CAPABILITIES,
  definePlugin,
  checkPlugin,
  type Capability,
  type EventRecord,
  type MoonstagePlugin,
  type PluginContext,
  type PluginInstance,
  type PluginLoadContext,
  type TransformPatch,
} from "./plugin.js";
export { Runtime, type LoadedProject, type RuntimeOptions, type Snapshot, type SoundRequest } from "./runtime.js";
export {
  buildFrame,
  spriteFrame,
  type RenderFrame,
  type Renderer,
  type DrawItem,
  type RectItem,
  type CircleItem,
  type PolygonItem,
  type TextItem,
  type SpriteItem,
  type CustomItem,
} from "./render.js";
export {
  loadProject,
  readJson,
  compiledBehaviorPath,
  behaviorWasmPath,
  BUILD_DIR,
  type ProjectIO,
  type LoadOptions,
  type LoadResult,
} from "./loader.js";
export { runTest, checkAssertion, type TestResult } from "./testing.js";
export { readZip, mspIO, MSP_FORMAT, type MspMetadata } from "./msp.js";
export {
  checkPluginConformance,
  type ConformanceFixture,
  type ConformanceCheck,
  type ConformanceReport,
} from "./conformance.js";
