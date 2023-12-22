// default export Oweb
import { Oweb } from './structures/Oweb';
export default Oweb;

// export structures
export * from './structures/Oweb';
export * from './structures/Route';
export * from './structures/Hook';

// export types
export * from './types';

// export fastify types
export type {
    FastifyBodyParser,
    FastifyContentTypeParser,
    AddContentTypeParser,
    hasContentTypeParser,
    getDefaultJsonParser,
    ProtoAction,
    ConstructorAction,
} from 'fastify/types/content-type-parser';
export type { FastifyContext, FastifyContextConfig } from 'fastify/types/context';
export type { FastifyErrorCodes } from 'fastify/types/errors';
export type {
    DoneFuncWithErrOrRes,
    HookHandlerDoneFunction,
    RequestPayload,
    onCloseAsyncHookHandler,
    onCloseHookHandler,
    onErrorAsyncHookHandler,
    onErrorHookHandler,
    onReadyAsyncHookHandler,
    onReadyHookHandler,
    onListenAsyncHookHandler,
    onListenHookHandler,
    onRegisterHookHandler,
    onRequestAsyncHookHandler,
    onRequestHookHandler,
    onResponseAsyncHookHandler,
    onResponseHookHandler,
    onRouteHookHandler,
    onSendAsyncHookHandler,
    onSendHookHandler,
    onTimeoutAsyncHookHandler,
    onTimeoutHookHandler,
    preHandlerAsyncHookHandler,
    preHandlerHookHandler,
    preParsingAsyncHookHandler,
    preParsingHookHandler,
    preSerializationAsyncHookHandler,
    preSerializationHookHandler,
    preValidationAsyncHookHandler,
    preValidationHookHandler,
    onRequestAbortHookHandler,
    onRequestAbortAsyncHookHandler,
} from 'fastify/types/hooks';
export type {
    FastifyListenOptions,
    FastifyInstance,
    PrintRoutesOptions,
} from 'fastify/types/instance';
export type {
    FastifyBaseLogger,
    FastifyLoggerInstance,
    FastifyLoggerOptions,
    PinoLoggerOptions,
    FastifyLogFn,
    LogLevel,
    Bindings,
    ChildLoggerOptions,
} from 'fastify/types/logger';
export type {
    FastifyPluginCallback,
    FastifyPluginAsync,
    FastifyPluginOptions,
    FastifyPlugin,
} from 'fastify/types/plugin';
export type {
    FastifyRegister,
    FastifyRegisterOptions,
    RegisterOptions,
} from 'fastify/types/register';
export type { FastifyReply } from 'fastify/types/reply';
export type { FastifyRequest, RequestGenericInterface } from 'fastify/types/request';
export type {
    RouteHandler,
    RouteHandlerMethod,
    RouteOptions,
    RouteShorthandMethod,
    RouteShorthandOptions,
    RouteShorthandOptionsWithHandler,
    RouteGenericInterface,
} from 'fastify/types/route';
export type {
    FastifySchema,
    FastifySchemaCompiler,
    FastifySchemaValidationError,
    SchemaErrorDataVar,
    SchemaErrorFormatter,
} from 'fastify/types/schema';
export type {
    FastifyServerFactory,
    FastifyServerFactoryHandler,
} from 'fastify/types/serverFactory';
export type { FastifyTypeProvider, FastifyTypeProviderDefault } from 'fastify/types/type-provider';
