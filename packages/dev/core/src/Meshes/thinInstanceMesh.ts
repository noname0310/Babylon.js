import type { Nullable, DeepImmutableObject } from "../types";
import { Mesh } from "../Meshes/mesh";
import { VertexBuffer, Buffer } from "../Buffers/buffer";
import { Matrix, Vector3, TmpVectors } from "../Maths/math.vector";
import { Logger } from "../Misc/logger";
import { BoundingInfo } from "core/Culling/boundingInfo";

declare module "./mesh" {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    export interface Mesh {
        /**
         * Gets or sets a boolean defining if we want picking to pick thin instances as well
         */
        thinInstanceEnablePicking: boolean;

        /**
         * Indicates that a buffer created as static should be recreated if the buffer is updated (by calling thinInstanceSetMatrixAt or thinInstanceSetAttributeAt, for eg.)
         * If this flag is false (the default behavior), a buffer created as "static" won't show any update done to it, and will stay the same as it was created.
         * Note however that recreating a buffer each time there's a change will have some performance cost, that's why it is set to false by default.
         * You should set this flag to true only if your static buffers should change infrequently. If they change frequently, you should create your buffers as "dynamic" instead.
         */
        thinInstanceAllowAutomaticStaticBufferRecreation: boolean;

        /**
         * Creates a new thin instance
         * @param matrix the matrix or array of matrices (position, rotation, scale) of the thin instance(s) to create
         * @param refresh true to refresh the underlying gpu buffer (default: true). If you do multiple calls to this method in a row, set refresh to true only for the last call to save performance
         * @returns the thin instance index number. If you pass an array of matrices, other instance indexes are index+1, index+2, etc
         */
        thinInstanceAdd(matrix: DeepImmutableObject<Matrix> | Array<DeepImmutableObject<Matrix>>, refresh?: boolean): number;

        /**
         * Adds the transformation (matrix) of the current mesh as a thin instance
         * @param refresh true to refresh the underlying gpu buffer (default: true). If you do multiple calls to this method in a row, set refresh to true only for the last call to save performance
         * @returns the thin instance index number
         */
        thinInstanceAddSelf(refresh?: boolean): number;

        /**
         * Registers a custom attribute to be used with thin instances
         * @param kind name of the attribute
         * @param stride size in floats of the attribute
         */
        thinInstanceRegisterAttribute(kind: string, stride: number): void;

        /**
         * Sets the matrix of a thin instance
         * @param index index of the thin instance
         * @param matrix matrix to set
         * @param refresh true to refresh the underlying gpu buffer (default: true). If you do multiple calls to this method in a row, set refresh to true only for the last call to save performance
         */
        thinInstanceSetMatrixAt(index: number, matrix: DeepImmutableObject<Matrix>, refresh?: boolean): void;

        /**
         * Sets the value of a custom attribute for a thin instance
         * @param kind name of the attribute
         * @param index index of the thin instance
         * @param value value to set
         * @param refresh true to refresh the underlying gpu buffer (default: true). If you do multiple calls to this method in a row, set refresh to true only for the last call to save performance
         */
        thinInstanceSetAttributeAt(kind: string, index: number, value: Array<number>, refresh?: boolean): void;

        /**
         * Gets / sets the number of thin instances to display. Note that you can't set a number higher than what the underlying buffer can handle.
         */
        thinInstanceCount: number;

        /**
         * Sets a buffer to be used with thin instances. This method is a faster way to setup multiple instances than calling thinInstanceAdd repeatedly
         * @param kind name of the attribute. Use "matrix" to setup the buffer of matrices
         * @param buffer buffer to set
         * @param stride size in floats of each value of the buffer
         * @param staticBuffer indicates that the buffer is static, so that you won't change it after it is set (better performances - true by default)
         */
        thinInstanceSetBuffer(kind: string, buffer: Nullable<Float32Array>, stride?: number, staticBuffer?: boolean): void;

        /**
         * Gets the list of world matrices
         * @returns an array containing all the world matrices from the thin instances
         */
        thinInstanceGetWorldMatrices(): Matrix[];

        /**
         * Synchronize the gpu buffers with a thin instance buffer. Call this method if you update later on the buffers passed to thinInstanceSetBuffer
         * @param kind name of the attribute to update. Use "matrix" to update the buffer of matrices
         */
        thinInstanceBufferUpdated(kind: string): void;

        /**
         * Applies a partial update to a buffer directly on the GPU
         * Note that the buffer located on the CPU is NOT updated! It's up to you to update it (or not) with the same data you pass to this method
         * @param kind name of the attribute to update. Use "matrix" to update the buffer of matrices
         * @param data the data to set in the GPU buffer
         * @param offset the offset in the GPU buffer where to update the data
         */
        thinInstancePartialBufferUpdate(kind: string, data: Float32Array, offset: number): void;

        /**
         * Refreshes the bounding info, taking into account all the thin instances defined
         * @param forceRefreshParentInfo true to force recomputing the mesh bounding info and use it to compute the aggregated bounding info
         * @param applySkeleton defines whether to apply the skeleton before computing the bounding info
         * @param applyMorph  defines whether to apply the morph target before computing the bounding info
         */
        thinInstanceRefreshBoundingInfo(forceRefreshParentInfo?: boolean, applySkeleton?: boolean, applyMorph?: boolean): void;

        /** @internal */
        _thinInstanceInitializeUserStorage(): void;

        /** @internal */
        _thinInstanceUpdateBufferSize(kind: string, numInstances?: number): void;

        /** @internal */
        _thinInstanceCreateMatrixBuffer(kind: string, buffer: Nullable<Float32Array>, staticBuffer: boolean): Buffer;

        /** @internal */
        _thinInstanceRecreateBuffer(kind: string, staticBuffer?: boolean): void;

        /** @internal */
        _userThinInstanceBuffersStorage: {
            data: { [key: string]: Float32Array };
            sizes: { [key: string]: number };
            vertexBuffers: { [key: string]: Nullable<VertexBuffer> };
            strides: { [key: string]: number };
        };
    }
}

Mesh.prototype.thinInstanceAdd = function (matrix: DeepImmutableObject<Matrix> | Array<DeepImmutableObject<Matrix>>, refresh: boolean = true): number {
    if (!this.getScene().getEngine().getCaps().instancedArrays) {
        Logger.Error("Thin Instances are not supported on this device as Instanced Array extension not supported");
        return -1;
    }

    this._thinInstanceUpdateBufferSize("matrix", Array.isArray(matrix) ? matrix.length : 1);

    const index = this._thinInstanceDataStorage.instancesCount;

    if (Array.isArray(matrix)) {
        for (let i = 0; i < matrix.length; ++i) {
            this.thinInstanceSetMatrixAt(this._thinInstanceDataStorage.instancesCount++, matrix[i], i === matrix.length - 1 && refresh);
        }
    } else {
        this.thinInstanceSetMatrixAt(this._thinInstanceDataStorage.instancesCount++, matrix, refresh);
    }

    return index;
};

Mesh.prototype.thinInstanceAddSelf = function (refresh: boolean = true): number {
    return this.thinInstanceAdd(Matrix.IdentityReadOnly, refresh);
};

Mesh.prototype.thinInstanceRegisterAttribute = function (kind: string, stride: number): void {
    // preserve backward compatibility
    if (kind === VertexBuffer.ColorKind) {
        kind = VertexBuffer.ColorInstanceKind;
    }

    this.removeVerticesData(kind);

    this._thinInstanceInitializeUserStorage();

    this._userThinInstanceBuffersStorage.strides[kind] = stride;
    this._userThinInstanceBuffersStorage.sizes[kind] = stride * Math.max(32, this._thinInstanceDataStorage.instancesCount); // Initial size
    this._userThinInstanceBuffersStorage.data[kind] = new Float32Array(this._userThinInstanceBuffersStorage.sizes[kind]);
    this._userThinInstanceBuffersStorage.vertexBuffers[kind] = new VertexBuffer(this.getEngine(), this._userThinInstanceBuffersStorage.data[kind], kind, true, false, stride, true);

    this.setVerticesBuffer(this._userThinInstanceBuffersStorage.vertexBuffers[kind]!);
};

Mesh.prototype.thinInstanceSetMatrixAt = function (index: number, matrix: DeepImmutableObject<Matrix>, refresh: boolean = true): boolean {
    if (!this._thinInstanceDataStorage.matrixData || index >= this._thinInstanceDataStorage.instancesCount) {
        return false;
    }

    const matrixData = this._thinInstanceDataStorage.matrixData;

    matrix.copyToArray(matrixData, index * 16);

    if (this._thinInstanceDataStorage.worldMatrices) {
        this._thinInstanceDataStorage.worldMatrices[index] = matrix as Matrix;
    }

    if (refresh) {
        this.thinInstanceBufferUpdated("matrix");

        if (!this.doNotSyncBoundingInfo) {
            this.thinInstanceRefreshBoundingInfo(false);
        }
    }

    return true;
};

Mesh.prototype.thinInstanceSetAttributeAt = function (kind: string, index: number, value: Array<number>, refresh: boolean = true): boolean {
    // preserve backward compatibility
    if (kind === VertexBuffer.ColorKind) {
        kind = VertexBuffer.ColorInstanceKind;
    }

    if (!this._userThinInstanceBuffersStorage || !this._userThinInstanceBuffersStorage.data[kind] || index >= this._thinInstanceDataStorage.instancesCount) {
        return false;
    }

    this._thinInstanceUpdateBufferSize(kind, 0); // make sur the buffer for the kind attribute is big enough

    this._userThinInstanceBuffersStorage.data[kind].set(value, index * this._userThinInstanceBuffersStorage.strides[kind]);

    if (refresh) {
        this.thinInstanceBufferUpdated(kind);
    }

    return true;
};

Object.defineProperty(Mesh.prototype, "thinInstanceCount", {
    get: function (this: Mesh) {
        return this._thinInstanceDataStorage.instancesCount;
    },
    set: function (this: Mesh, value: number) {
        const matrixData = this._thinInstanceDataStorage.matrixData ?? this.source?._thinInstanceDataStorage.matrixData;
        const numMaxInstances = matrixData ? matrixData.length / 16 : 0;

        if (value <= numMaxInstances) {
            this._thinInstanceDataStorage.instancesCount = value;
        }
    },
    enumerable: true,
    configurable: true,
});

Mesh.prototype._thinInstanceCreateMatrixBuffer = function (kind: string, buffer: Float32Array, staticBuffer: boolean = true): Buffer {
    const matrixBuffer = new Buffer(this.getEngine(), buffer, !staticBuffer, 16, false, true);

    for (let i = 0; i < 4; i++) {
        this.setVerticesBuffer(matrixBuffer.createVertexBuffer(kind + i, i * 4, 4));
    }

    return matrixBuffer;
};

Mesh.prototype.thinInstanceSetBuffer = function (kind: string, buffer: Nullable<Float32Array>, stride: number = 0, staticBuffer: boolean = true): void {
    stride = stride || 16;

    if (kind === "matrix") {
        this._thinInstanceDataStorage.matrixBuffer?.dispose();
        this._thinInstanceDataStorage.matrixBuffer = null;
        this._thinInstanceDataStorage.matrixBufferSize = buffer ? buffer.length : 32 * stride;
        this._thinInstanceDataStorage.matrixData = buffer;
        this._thinInstanceDataStorage.worldMatrices = null;

        if (buffer !== null) {
            this._thinInstanceDataStorage.instancesCount = buffer.length / stride;
            this._thinInstanceDataStorage.matrixBuffer = this._thinInstanceCreateMatrixBuffer("world", buffer, staticBuffer);

            if (!this.doNotSyncBoundingInfo) {
                this.thinInstanceRefreshBoundingInfo(false);
            }
        } else {
            this._thinInstanceDataStorage.instancesCount = 0;
            if (!this.doNotSyncBoundingInfo) {
                // mesh has no more thin instances, so need to recompute the bounding box because it's the regular mesh that will now be displayed
                this.refreshBoundingInfo();
            }
        }
    } else if (kind === "previousMatrix") {
        this._thinInstanceDataStorage.previousMatrixBuffer?.dispose();
        this._thinInstanceDataStorage.previousMatrixBuffer = null;
        this._thinInstanceDataStorage.previousMatrixData = buffer;
        if (buffer !== null) {
            this._thinInstanceDataStorage.previousMatrixBuffer = this._thinInstanceCreateMatrixBuffer("previousWorld", buffer, staticBuffer);
        }
    } else {
        // color for instanced mesh is ColorInstanceKind and not ColorKind because of native that needs to do the differenciation
        // hot switching kind here to preserve backward compatibility
        if (kind === VertexBuffer.ColorKind) {
            kind = VertexBuffer.ColorInstanceKind;
        }

        if (buffer === null) {
            if (this._userThinInstanceBuffersStorage?.data[kind]) {
                this.removeVerticesData(kind);
                delete this._userThinInstanceBuffersStorage.data[kind];
                delete this._userThinInstanceBuffersStorage.strides[kind];
                delete this._userThinInstanceBuffersStorage.sizes[kind];
                delete this._userThinInstanceBuffersStorage.vertexBuffers[kind];
            }
        } else {
            this._thinInstanceInitializeUserStorage();

            this._userThinInstanceBuffersStorage.data[kind] = buffer;
            this._userThinInstanceBuffersStorage.strides[kind] = stride;
            this._userThinInstanceBuffersStorage.sizes[kind] = buffer.length;
            this._userThinInstanceBuffersStorage.vertexBuffers[kind] = new VertexBuffer(this.getEngine(), buffer, kind, !staticBuffer, false, stride, true);

            this.setVerticesBuffer(this._userThinInstanceBuffersStorage.vertexBuffers[kind]!);
        }
    }
};

Mesh.prototype.thinInstanceBufferUpdated = function (kind: string): void {
    if (kind === "matrix") {
        if (this.thinInstanceAllowAutomaticStaticBufferRecreation && this._thinInstanceDataStorage.matrixBuffer && !this._thinInstanceDataStorage.matrixBuffer.isUpdatable()) {
            this._thinInstanceRecreateBuffer(kind);
        }
        this._thinInstanceDataStorage.matrixBuffer?.updateDirectly(this._thinInstanceDataStorage.matrixData!, 0, this._thinInstanceDataStorage.instancesCount);
    } else if (kind === "previousMatrix") {
        if (
            this.thinInstanceAllowAutomaticStaticBufferRecreation &&
            this._thinInstanceDataStorage.previousMatrixBuffer &&
            !this._thinInstanceDataStorage.previousMatrixBuffer.isUpdatable()
        ) {
            this._thinInstanceRecreateBuffer(kind);
        }
        this._thinInstanceDataStorage.previousMatrixBuffer?.updateDirectly(this._thinInstanceDataStorage.previousMatrixData!, 0, this._thinInstanceDataStorage.instancesCount);
    } else {
        // preserve backward compatibility
        if (kind === VertexBuffer.ColorKind) {
            kind = VertexBuffer.ColorInstanceKind;
        }

        if (this._userThinInstanceBuffersStorage?.vertexBuffers[kind]) {
            if (this.thinInstanceAllowAutomaticStaticBufferRecreation && !this._userThinInstanceBuffersStorage.vertexBuffers[kind]!.isUpdatable()) {
                this._thinInstanceRecreateBuffer(kind);
            }
            this._userThinInstanceBuffersStorage.vertexBuffers[kind]!.updateDirectly(this._userThinInstanceBuffersStorage.data[kind], 0);
        }
    }
};

Mesh.prototype.thinInstancePartialBufferUpdate = function (kind: string, data: Float32Array, offset: number): void {
    if (kind === "matrix") {
        if (this._thinInstanceDataStorage.matrixBuffer) {
            this._thinInstanceDataStorage.matrixBuffer.updateDirectly(data, offset);
        }
    } else {
        // preserve backward compatibility
        if (kind === VertexBuffer.ColorKind) {
            kind = VertexBuffer.ColorInstanceKind;
        }

        if (this._userThinInstanceBuffersStorage?.vertexBuffers[kind]) {
            this._userThinInstanceBuffersStorage.vertexBuffers[kind]!.updateDirectly(data, offset);
        }
    }
};

Mesh.prototype.thinInstanceGetWorldMatrices = function (): Matrix[] {
    if (!this._thinInstanceDataStorage.matrixData || !this._thinInstanceDataStorage.matrixBuffer) {
        return [];
    }
    const matrixData = this._thinInstanceDataStorage.matrixData;

    if (!this._thinInstanceDataStorage.worldMatrices) {
        this._thinInstanceDataStorage.worldMatrices = [] as Matrix[];

        for (let i = 0; i < this._thinInstanceDataStorage.instancesCount; ++i) {
            this._thinInstanceDataStorage.worldMatrices[i] = Matrix.FromArray(matrixData, i * 16);
        }
    }

    return this._thinInstanceDataStorage.worldMatrices;
};

Mesh.prototype.thinInstanceRefreshBoundingInfo = function (forceRefreshParentInfo: boolean = false, applySkeleton: boolean = false, applyMorph: boolean = false) {
    if (!this._thinInstanceDataStorage.matrixData || !this._thinInstanceDataStorage.matrixBuffer) {
        return;
    }

    const vectors = this._thinInstanceDataStorage.boundingVectors;

    if (forceRefreshParentInfo || !this.rawBoundingInfo) {
        vectors.length = 0;
        this.refreshBoundingInfo(applySkeleton, applyMorph);
        const boundingInfo = this.getBoundingInfo();
        this.rawBoundingInfo = new BoundingInfo(boundingInfo.minimum, boundingInfo.maximum);
    }

    const boundingInfo = this.getBoundingInfo();
    const matrixData = this._thinInstanceDataStorage.matrixData;

    if (vectors.length === 0) {
        for (let v = 0; v < boundingInfo.boundingBox.vectors.length; ++v) {
            vectors.push(boundingInfo.boundingBox.vectors[v].clone());
        }
    }

    TmpVectors.Vector3[0].setAll(Number.POSITIVE_INFINITY); // min
    TmpVectors.Vector3[1].setAll(Number.NEGATIVE_INFINITY); // max

    for (let i = 0; i < this._thinInstanceDataStorage.instancesCount; ++i) {
        Matrix.FromArrayToRef(matrixData, i * 16, TmpVectors.Matrix[0]);

        for (let v = 0; v < vectors.length; ++v) {
            Vector3.TransformCoordinatesToRef(vectors[v], TmpVectors.Matrix[0], TmpVectors.Vector3[2]);
            TmpVectors.Vector3[0].minimizeInPlace(TmpVectors.Vector3[2]);
            TmpVectors.Vector3[1].maximizeInPlace(TmpVectors.Vector3[2]);
        }
    }

    boundingInfo.reConstruct(TmpVectors.Vector3[0], TmpVectors.Vector3[1]);

    this._updateBoundingInfo();
};

Mesh.prototype._thinInstanceRecreateBuffer = function (kind: string, staticBuffer: boolean = true) {
    if (kind === "matrix") {
        this._thinInstanceDataStorage.matrixBuffer?.dispose();
        this._thinInstanceDataStorage.matrixBuffer = this._thinInstanceCreateMatrixBuffer("world", this._thinInstanceDataStorage.matrixData, staticBuffer);
    } else if (kind === "previousMatrix") {
        if (this._scene.needsPreviousWorldMatrices) {
            this._thinInstanceDataStorage.previousMatrixBuffer?.dispose();
            this._thinInstanceDataStorage.previousMatrixBuffer = this._thinInstanceCreateMatrixBuffer(
                "previousWorld",
                this._thinInstanceDataStorage.previousMatrixData ?? this._thinInstanceDataStorage.matrixData,
                staticBuffer
            );
        }
    } else {
        if (kind === VertexBuffer.ColorKind) {
            kind = VertexBuffer.ColorInstanceKind;
        }

        this._userThinInstanceBuffersStorage.vertexBuffers[kind]?.dispose();
        this._userThinInstanceBuffersStorage.vertexBuffers[kind] = new VertexBuffer(
            this.getEngine(),
            this._userThinInstanceBuffersStorage.data[kind],
            kind,
            !staticBuffer,
            false,
            this._userThinInstanceBuffersStorage.strides[kind],
            true
        );
        this.setVerticesBuffer(this._userThinInstanceBuffersStorage.vertexBuffers[kind]!);
    }
};

Mesh.prototype._thinInstanceUpdateBufferSize = function (kind: string, numInstances: number = 1) {
    // preserve backward compatibility
    if (kind === VertexBuffer.ColorKind) {
        kind = VertexBuffer.ColorInstanceKind;
    }

    const kindIsMatrix = kind === "matrix";

    if (!kindIsMatrix && (!this._userThinInstanceBuffersStorage || !this._userThinInstanceBuffersStorage.strides[kind])) {
        return;
    }

    const stride = kindIsMatrix ? 16 : this._userThinInstanceBuffersStorage.strides[kind];
    const currentSize = kindIsMatrix ? this._thinInstanceDataStorage.matrixBufferSize : this._userThinInstanceBuffersStorage.sizes[kind];
    let data = kindIsMatrix ? this._thinInstanceDataStorage.matrixData : this._userThinInstanceBuffersStorage.data[kind];

    const bufferSize = (this._thinInstanceDataStorage.instancesCount + numInstances) * stride;

    let newSize = currentSize;

    while (newSize < bufferSize) {
        newSize *= 2;
    }

    if (!data || currentSize != newSize) {
        if (!data) {
            data = new Float32Array(newSize);
        } else {
            const newData = new Float32Array(newSize);
            newData.set(data, 0);
            data = newData;
        }

        if (kindIsMatrix) {
            this._thinInstanceDataStorage.matrixBuffer?.dispose();
            this._thinInstanceDataStorage.matrixBuffer = this._thinInstanceCreateMatrixBuffer("world", data, false);
            this._thinInstanceDataStorage.matrixData = data;
            this._thinInstanceDataStorage.matrixBufferSize = newSize;
            if (this._scene.needsPreviousWorldMatrices && !this._thinInstanceDataStorage.previousMatrixData) {
                this._thinInstanceDataStorage.previousMatrixBuffer?.dispose();
                this._thinInstanceDataStorage.previousMatrixBuffer = this._thinInstanceCreateMatrixBuffer("previousWorld", data, false);
            }
        } else {
            this._userThinInstanceBuffersStorage.vertexBuffers[kind]?.dispose();

            this._userThinInstanceBuffersStorage.data[kind] = data;
            this._userThinInstanceBuffersStorage.sizes[kind] = newSize;
            this._userThinInstanceBuffersStorage.vertexBuffers[kind] = new VertexBuffer(this.getEngine(), data, kind, true, false, stride, true);

            this.setVerticesBuffer(this._userThinInstanceBuffersStorage.vertexBuffers[kind]!);
        }
    }
};

Mesh.prototype._thinInstanceInitializeUserStorage = function () {
    if (!this._userThinInstanceBuffersStorage) {
        this._userThinInstanceBuffersStorage = {
            data: {},
            sizes: {},
            vertexBuffers: {},
            strides: {},
        };
    }
};

Mesh.prototype._disposeThinInstanceSpecificData = function () {
    if (this._thinInstanceDataStorage?.matrixBuffer) {
        this._thinInstanceDataStorage.matrixBuffer.dispose();
        this._thinInstanceDataStorage.matrixBuffer = null;
    }
    if (this._thinInstanceDataStorage?.previousMatrixBuffer) {
        this._thinInstanceDataStorage.previousMatrixBuffer.dispose();
        this._thinInstanceDataStorage.previousMatrixBuffer = null;
    }
};
