/* eslint-disable import/export */
/* eslint-disable @typescript-eslint/no-restricted-imports */
// export * from "./legacy-glTF";
// export * from "./legacy-glTF1";
// export * from "./legacy-glTF2";
// export * from "./legacy-objFileLoader";
// export * from "./legacy-stlFileLoader";

import * as FileLoader from "../../../../dev/loaders/src/glTF/glTFFileLoader";
import * as Validation from "../../../../dev/loaders/src/glTF/glTFValidation";

/**
 * This is the entry point for the UMD module.
 * The entry point for a future ESM package should be index.ts
 */
const GlobalObject = typeof global !== "undefined" ? global : typeof window !== "undefined" ? window : undefined;
if (typeof GlobalObject !== "undefined") {
    (<any>GlobalObject).BABYLON = (<any>GlobalObject).BABYLON || {};
    for (const key in FileLoader) {
        (<any>GlobalObject).BABYLON[key] = (<any>FileLoader)[key];
    }
    for (const key in Validation) {
        (<any>GlobalObject).BABYLON[key] = (<any>Validation)[key];
    }
}

export { FileLoader, Validation };

/* eslint-disable @typescript-eslint/no-restricted-imports */
import * as GLTF1 from "../../../../dev/loaders/src/glTF/1.0/index";

/**
 * This is the entry point for the UMD module.
 * The entry point for a future ESM package should be index.ts
 */
if (typeof GlobalObject !== "undefined") {
    (<any>GlobalObject).BABYLON = (<any>GlobalObject).BABYLON || {};
    (<any>GlobalObject).BABYLON.GLTF1 = (<any>GlobalObject).BABYLON.GLTF1 || {};
    for (const key in GLTF1) {
        (<any>GlobalObject).BABYLON.GLTF1[key] = (<any>GLTF1)[key];
    }
}

export { GLTF1 };

/* eslint-disable @typescript-eslint/no-restricted-imports */
import * as Extensions from "../../../../dev/loaders/src/glTF/2.0/Extensions/index";
import * as Interfaces from "../../../../dev/loaders/src/glTF/2.0/glTFLoaderInterfaces";
import * as GLTF2 from "../../../../dev/loaders/src/glTF/2.0/index";

/**
 * This is the entry point for the UMD module.
 * The entry point for a future ESM package should be index.ts
 */
if (typeof GlobalObject !== "undefined") {
    (<any>GlobalObject).BABYLON = (<any>GlobalObject).BABYLON || {};
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const BABYLON = (<any>GlobalObject).BABYLON;
    BABYLON.GLTF2 = BABYLON.GLTF2 || {};
    BABYLON.GLTF2.Loader = BABYLON.GLTF2.Loader || {};
    BABYLON.GLTF2.Loader.Extensions = BABYLON.GLTF2.Loader.Extensions || {};

    const keys = [];
    for (const key in Extensions) {
        BABYLON.GLTF2.Loader.Extensions[key] = (<any>Extensions)[key];
        keys.push(key);
    }
    for (const key in Interfaces) {
        BABYLON.GLTF2.Loader[key] = (<any>Interfaces)[key];
        keys.push(key);
    }

    for (const key in GLTF2) {
        // Prevent Reassignment.
        if (keys.indexOf(key) > -1) {
            continue;
        }

        BABYLON.GLTF2[key] = (<any>GLTF2)[key];
    }
}

export { GLTF2 };

/* eslint-disable @typescript-eslint/no-restricted-imports */
import * as OBJLoaders from "../../../../dev/loaders/src/OBJ/index";

/**
 * This is the entry point for the UMD module.
 * The entry point for a future ESM package should be index.ts
 */
if (typeof GlobalObject !== "undefined") {
    for (const key in OBJLoaders) {
        (<any>GlobalObject).BABYLON[key] = (<any>OBJLoaders)[key];
    }
}

export * from "../../../../dev/loaders/src/OBJ/index";

/* eslint-disable @typescript-eslint/no-restricted-imports */
import * as Loaders from "../../../../dev/loaders/src/STL/index";

/**
 * This is the entry point for the UMD module.
 * The entry point for a future ESM package should be index.ts
 */
if (typeof GlobalObject !== "undefined") {
    for (const key in Loaders) {
        (<any>GlobalObject).BABYLON[key] = (<any>Loaders)[key];
    }
}

export * from "../../../../dev/loaders/src/STL/index";
