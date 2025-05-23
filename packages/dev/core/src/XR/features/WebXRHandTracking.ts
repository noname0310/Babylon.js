import { WebXRAbstractFeature } from "./WebXRAbstractFeature";
import type { WebXRSessionManager } from "../webXRSessionManager";
import { WebXRFeatureName, WebXRFeaturesManager } from "../webXRFeaturesManager";
import type { AbstractMesh } from "../../Meshes/abstractMesh";
import type { Mesh } from "../../Meshes/mesh";
import type { WebXRInput } from "../webXRInput";
import type { WebXRInputSource } from "../webXRInputSource";
import { Matrix, Quaternion } from "../../Maths/math.vector";
import type { Nullable } from "../../types";
import { PhysicsImpostor } from "../../Physics/v1/physicsImpostor";

import type { IDisposable, Scene } from "../../scene";
import type { Observer } from "../../Misc/observable";
import { Observable } from "../../Misc/observable";
import type { InstancedMesh } from "../../Meshes/instancedMesh";
import type { ISceneLoaderAsyncResult } from "../../Loading/sceneLoader";
import { SceneLoader } from "../../Loading/sceneLoader";
import { Color3 } from "../../Maths/math.color";
import { NodeMaterial } from "../../Materials/Node/nodeMaterial";
import type { InputBlock } from "../../Materials/Node/Blocks/Input/inputBlock";
import { Material } from "../../Materials/material";
import { CreateIcoSphere } from "../../Meshes/Builders/icoSphereBuilder";
import { TransformNode } from "../../Meshes/transformNode";
import { Axis } from "../../Maths/math.axis";
import { EngineStore } from "../../Engines/engineStore";
import { Constants } from "../../Engines/constants";
import type { WebXRCompositionLayerWrapper } from "./Layers/WebXRCompositionLayer";
import { Tools } from "core/Misc/tools";

declare const XRHand: XRHand;

/**
 * Configuration interface for the hand tracking feature
 */
export interface IWebXRHandTrackingOptions {
    /**
     * The xrInput that will be used as source for new hands
     */
    xrInput: WebXRInput;

    /**
     * Configuration object for the joint meshes.
     */
    jointMeshes?: {
        /**
         * Should the meshes created be invisible (defaults to false).
         */
        invisible?: boolean;
        /**
         * A source mesh to be used to create instances. Defaults to an icosphere with two subdivisions and smooth lighting.
         * This mesh will be the source for all other (25) meshes.
         * It should have the general size of a single unit, as the instances will be scaled according to the provided radius.
         */
        sourceMesh?: Mesh;
        /**
         * This function will be called after a mesh was created for a specific joint.
         * Using this function you can either manipulate the instance or return a new mesh.
         * When returning a new mesh the instance created before will be disposed.
         * @param meshInstance An instance of the original joint mesh being used for the joint.
         * @param jointId The joint's index, see https://immersive-web.github.io/webxr-hand-input/#skeleton-joints-section for more info.
         * @param hand Which hand ("left", "right") the joint will be on.
         */
        onHandJointMeshGenerated?: (meshInstance: InstancedMesh, jointId: number, hand: XRHandedness) => AbstractMesh | undefined;
        /**
         * Should the source mesh stay visible (defaults to false).
         */
        keepOriginalVisible?: boolean;
        /**
         * Should each instance have its own physics impostor
         */
        enablePhysics?: boolean;
        /**
         * If enabled, override default physics properties
         */
        physicsProps?: { friction?: number; restitution?: number; impostorType?: number };
        /**
         * Scale factor for all joint meshes (defaults to 1)
         */
        scaleFactor?: number;
    };

    /**
     * Configuration object for the hand meshes.
     */
    handMeshes?: {
        /**
         * Should the default hand mesh be disabled. In this case, the spheres will be visible (unless set invisible).
         */
        disableDefaultMeshes?: boolean;
        /**
         * Rigged hand meshes that will be tracked to the user's hands. This will override the default hand mesh.
         */
        customMeshes?: {
            right: AbstractMesh;
            left: AbstractMesh;
        };
        /**
         * Are the meshes prepared for a left-handed system. Default hand meshes are right-handed.
         */
        meshesUseLeftHandedCoordinates?: boolean;
        /**
         * If a hand mesh was provided, this array will define what axis will update which node. This will override the default hand mesh
         */
        customRigMappings?: {
            right: XRHandMeshRigMapping;
            left: XRHandMeshRigMapping;
        };

        /**
         * Override the colors of the hand meshes.
         */
        customColors?: {
            base?: Color3;
            fresnel?: Color3;
            fingerColor?: Color3;
            tipFresnel?: Color3;
        };

        /**
         * Define whether or not the hand meshes should be disposed on just invisible when the session ends.
         * Not setting, or setting to false, will maintain the hand meshes in the scene after the session ends, which will allow q quicker re-entry into XR.
         */
        disposeOnSessionEnd?: boolean;

        /**
         * Setting this will allow the developer to avoid loading the NME material and use the standard material instead.
         */
        disableHandShader?: boolean;
    };
}

/**
 * Parts of the hands divided to writs and finger names
 */
export const enum HandPart {
    /**
     * HandPart - Wrist
     */
    WRIST = "wrist",
    /**
     * HandPart - The thumb
     */
    THUMB = "thumb",
    /**
     * HandPart - Index finger
     */
    INDEX = "index",
    /**
     * HandPart - Middle finger
     */
    MIDDLE = "middle",
    /**
     * HandPart - Ring finger
     */
    RING = "ring",
    /**
     * HandPart - Little finger
     */
    LITTLE = "little",
}

/**
 * Joints of the hand as defined by the WebXR specification.
 * https://immersive-web.github.io/webxr-hand-input/#skeleton-joints-section
 */
export const enum WebXRHandJoint {
    /** Wrist */
    WRIST = "wrist",

    /** Thumb near wrist */
    THUMB_METACARPAL = "thumb-metacarpal",
    /** Thumb first knuckle */
    THUMB_PHALANX_PROXIMAL = "thumb-phalanx-proximal",
    /** Thumb second knuckle */
    THUMB_PHALANX_DISTAL = "thumb-phalanx-distal",
    /** Thumb tip */
    THUMB_TIP = "thumb-tip",

    /** Index finger near wrist */
    INDEX_FINGER_METACARPAL = "index-finger-metacarpal",
    /** Index finger first knuckle */
    INDEX_FINGER_PHALANX_PROXIMAL = "index-finger-phalanx-proximal",
    /** Index finger second knuckle */
    INDEX_FINGER_PHALANX_INTERMEDIATE = "index-finger-phalanx-intermediate",
    /** Index finger third knuckle */
    INDEX_FINGER_PHALANX_DISTAL = "index-finger-phalanx-distal",
    /** Index finger tip */
    INDEX_FINGER_TIP = "index-finger-tip",

    /** Middle finger near wrist */
    MIDDLE_FINGER_METACARPAL = "middle-finger-metacarpal",
    /** Middle finger first knuckle */
    MIDDLE_FINGER_PHALANX_PROXIMAL = "middle-finger-phalanx-proximal",
    /** Middle finger second knuckle */
    MIDDLE_FINGER_PHALANX_INTERMEDIATE = "middle-finger-phalanx-intermediate",
    /** Middle finger third knuckle */
    MIDDLE_FINGER_PHALANX_DISTAL = "middle-finger-phalanx-distal",
    /** Middle finger tip */
    MIDDLE_FINGER_TIP = "middle-finger-tip",

    /** Ring finger near wrist */
    RING_FINGER_METACARPAL = "ring-finger-metacarpal",
    /** Ring finger first knuckle */
    RING_FINGER_PHALANX_PROXIMAL = "ring-finger-phalanx-proximal",
    /** Ring finger second knuckle */
    RING_FINGER_PHALANX_INTERMEDIATE = "ring-finger-phalanx-intermediate",
    /** Ring finger third knuckle */
    RING_FINGER_PHALANX_DISTAL = "ring-finger-phalanx-distal",
    /** Ring finger tip */
    RING_FINGER_TIP = "ring-finger-tip",

    /** Pinky finger near wrist */
    PINKY_FINGER_METACARPAL = "pinky-finger-metacarpal",
    /** Pinky finger first knuckle */
    PINKY_FINGER_PHALANX_PROXIMAL = "pinky-finger-phalanx-proximal",
    /** Pinky finger second knuckle */
    PINKY_FINGER_PHALANX_INTERMEDIATE = "pinky-finger-phalanx-intermediate",
    /** Pinky finger third knuckle */
    PINKY_FINGER_PHALANX_DISTAL = "pinky-finger-phalanx-distal",
    /** Pinky finger tip */
    PINKY_FINGER_TIP = "pinky-finger-tip",
}

/** A type encapsulating a dictionary mapping WebXR joints to bone names in a rigged hand mesh.  */
export type XRHandMeshRigMapping = { [webXRJointName in WebXRHandJoint]: string };

const HandJointReferenceArray: WebXRHandJoint[] = [
    WebXRHandJoint.WRIST,
    WebXRHandJoint.THUMB_METACARPAL,
    WebXRHandJoint.THUMB_PHALANX_PROXIMAL,
    WebXRHandJoint.THUMB_PHALANX_DISTAL,
    WebXRHandJoint.THUMB_TIP,
    WebXRHandJoint.INDEX_FINGER_METACARPAL,
    WebXRHandJoint.INDEX_FINGER_PHALANX_PROXIMAL,
    WebXRHandJoint.INDEX_FINGER_PHALANX_INTERMEDIATE,
    WebXRHandJoint.INDEX_FINGER_PHALANX_DISTAL,
    WebXRHandJoint.INDEX_FINGER_TIP,
    WebXRHandJoint.MIDDLE_FINGER_METACARPAL,
    WebXRHandJoint.MIDDLE_FINGER_PHALANX_PROXIMAL,
    WebXRHandJoint.MIDDLE_FINGER_PHALANX_INTERMEDIATE,
    WebXRHandJoint.MIDDLE_FINGER_PHALANX_DISTAL,
    WebXRHandJoint.MIDDLE_FINGER_TIP,
    WebXRHandJoint.RING_FINGER_METACARPAL,
    WebXRHandJoint.RING_FINGER_PHALANX_PROXIMAL,
    WebXRHandJoint.RING_FINGER_PHALANX_INTERMEDIATE,
    WebXRHandJoint.RING_FINGER_PHALANX_DISTAL,
    WebXRHandJoint.RING_FINGER_TIP,
    WebXRHandJoint.PINKY_FINGER_METACARPAL,
    WebXRHandJoint.PINKY_FINGER_PHALANX_PROXIMAL,
    WebXRHandJoint.PINKY_FINGER_PHALANX_INTERMEDIATE,
    WebXRHandJoint.PINKY_FINGER_PHALANX_DISTAL,
    WebXRHandJoint.PINKY_FINGER_TIP,
];

const HandPartsDefinition: { [key in HandPart]: WebXRHandJoint[] } = {
    [HandPart.WRIST]: [WebXRHandJoint.WRIST],
    [HandPart.THUMB]: [WebXRHandJoint.THUMB_METACARPAL, WebXRHandJoint.THUMB_PHALANX_PROXIMAL, WebXRHandJoint.THUMB_PHALANX_DISTAL, WebXRHandJoint.THUMB_TIP],
    [HandPart.INDEX]: [
        WebXRHandJoint.INDEX_FINGER_METACARPAL,
        WebXRHandJoint.INDEX_FINGER_PHALANX_PROXIMAL,
        WebXRHandJoint.INDEX_FINGER_PHALANX_INTERMEDIATE,
        WebXRHandJoint.INDEX_FINGER_PHALANX_DISTAL,
        WebXRHandJoint.INDEX_FINGER_TIP,
    ],
    [HandPart.MIDDLE]: [
        WebXRHandJoint.MIDDLE_FINGER_METACARPAL,
        WebXRHandJoint.MIDDLE_FINGER_PHALANX_PROXIMAL,
        WebXRHandJoint.MIDDLE_FINGER_PHALANX_INTERMEDIATE,
        WebXRHandJoint.MIDDLE_FINGER_PHALANX_DISTAL,
        WebXRHandJoint.MIDDLE_FINGER_TIP,
    ],
    [HandPart.RING]: [
        WebXRHandJoint.RING_FINGER_METACARPAL,
        WebXRHandJoint.RING_FINGER_PHALANX_PROXIMAL,
        WebXRHandJoint.RING_FINGER_PHALANX_INTERMEDIATE,
        WebXRHandJoint.RING_FINGER_PHALANX_DISTAL,
        WebXRHandJoint.RING_FINGER_TIP,
    ],
    [HandPart.LITTLE]: [
        WebXRHandJoint.PINKY_FINGER_METACARPAL,
        WebXRHandJoint.PINKY_FINGER_PHALANX_PROXIMAL,
        WebXRHandJoint.PINKY_FINGER_PHALANX_INTERMEDIATE,
        WebXRHandJoint.PINKY_FINGER_PHALANX_DISTAL,
        WebXRHandJoint.PINKY_FINGER_TIP,
    ],
};

/**
 * Representing a single hand (with its corresponding native XRHand object)
 */
export class WebXRHand implements IDisposable {
    /**
     * This observable will notify registered observers when the hand object has been set with a new mesh.
     * you can get the hand mesh using `webxrHand.handMesh`
     */
    public onHandMeshSetObservable = new Observable<WebXRHand>();

    private _scene: Scene;

    /**
     * Transform nodes that will directly receive the transforms from the WebXR matrix data.
     */
    private _jointTransforms = new Array<TransformNode>(HandJointReferenceArray.length);

    /**
     * The float array that will directly receive the transform matrix data from WebXR.
     */
    private _jointTransformMatrices = new Float32Array(HandJointReferenceArray.length * 16);

    private _tempJointMatrix = new Matrix();

    /**
     * The float array that will directly receive the joint radii from WebXR.
     */
    private _jointRadii = new Float32Array(HandJointReferenceArray.length);

    /**
     * Get the hand mesh.
     */
    public get handMesh(): Nullable<AbstractMesh> {
        return this._handMesh;
    }

    /**
     * Get meshes of part of the hand.
     * @param part The part of hand to get.
     * @returns An array of meshes that correlate to the hand part requested.
     */
    public getHandPartMeshes(part: HandPart): AbstractMesh[] {
        return HandPartsDefinition[part].map((name) => this._jointMeshes[HandJointReferenceArray.indexOf(name)]);
    }

    /**
     * Retrieves a mesh linked to a named joint in the hand.
     * @param jointName The name of the joint.
     * @returns An AbstractMesh whose position corresponds with the joint position.
     */
    public getJointMesh(jointName: WebXRHandJoint): AbstractMesh {
        return this._jointMeshes[HandJointReferenceArray.indexOf(jointName)];
    }

    /**
     * Construct a new hand object
     * @param xrController The controller to which the hand correlates.
     * @param _jointMeshes The meshes to be used to track the hand joints.
     * @param _handMesh An optional hand mesh.
     * @param rigMapping An optional rig mapping for the hand mesh.
     *                   If not provided (but a hand mesh is provided),
     *                   it will be assumed that the hand mesh's bones are named
     *                   directly after the WebXR bone names.
     * @param _leftHandedMeshes Are the hand meshes left-handed-system meshes
     * @param _jointsInvisible Are the tracked joint meshes visible
     * @param _jointScaleFactor Scale factor for all joint meshes
     */
    constructor(
        /** The controller to which the hand correlates. */
        public readonly xrController: WebXRInputSource,
        private readonly _jointMeshes: AbstractMesh[],
        private _handMesh: Nullable<AbstractMesh>,
        /** An optional rig mapping for the hand mesh. If not provided (but a hand mesh is provided),
         * it will be assumed that the hand mesh's bones are named directly after the WebXR bone names. */
        readonly rigMapping: Nullable<XRHandMeshRigMapping>,
        private readonly _leftHandedMeshes: boolean = false,
        private readonly _jointsInvisible: boolean = false,
        private readonly _jointScaleFactor: number = 1
    ) {
        this._scene = _jointMeshes[0].getScene();

        // Initialize the joint transform quaternions and link the transforms to the bones.
        for (let jointIdx = 0; jointIdx < this._jointTransforms.length; jointIdx++) {
            this._jointTransforms[jointIdx] = new TransformNode(HandJointReferenceArray[jointIdx], this._scene);
            this._jointTransforms[jointIdx].rotationQuaternion = new Quaternion();

            // Set the rotation quaternion so we can use it later for tracking.
            if (_jointMeshes[jointIdx].rotationQuaternion) {
                _jointMeshes[jointIdx].rotationQuaternion = new Quaternion();
            } else {
                _jointMeshes[jointIdx].rotationQuaternion?.set(0, 0, 0, 1);
            }
        }

        if (_handMesh) {
            // Note that this logic needs to happen after we initialize the joint tracking transform nodes.
            this.setHandMesh(_handMesh, rigMapping);
        }

        // hide the motion controller, if available/loaded
        if (this.xrController.motionController) {
            if (this.xrController.motionController.rootMesh) {
                this.xrController.motionController.rootMesh.dispose(false, true);
            }
        }

        this.xrController.onMotionControllerInitObservable.add((motionController) => {
            motionController._doNotLoadControllerMesh = true;
        });
    }

    /**
     * Sets the current hand mesh to render for the WebXRHand.
     * @param handMesh The rigged hand mesh that will be tracked to the user's hand.
     * @param rigMapping The mapping from XRHandJoint to bone names to use with the mesh.
     * @param _xrSessionManager The XRSessionManager used to initialize the hand mesh.
     */
    public setHandMesh(handMesh: AbstractMesh, rigMapping: Nullable<XRHandMeshRigMapping>, _xrSessionManager?: WebXRSessionManager) {
        this._handMesh = handMesh;

        // Avoid any strange frustum culling. We will manually control visibility via attach and detach.
        handMesh.alwaysSelectAsActiveMesh = true;
        const children = handMesh.getChildMeshes();
        for (const mesh of children) {
            mesh.alwaysSelectAsActiveMesh = true;
        }

        // Link the bones in the hand mesh to the transform nodes that will be bound to the WebXR tracked joints.
        if (this._handMesh.skeleton) {
            const handMeshSkeleton = this._handMesh.skeleton;
            for (let jointIdx = 0; jointIdx < HandJointReferenceArray.length; jointIdx++) {
                const jointName = HandJointReferenceArray[jointIdx];
                const jointBoneIdx = handMeshSkeleton.getBoneIndexByName(rigMapping ? rigMapping[jointName] : jointName);
                if (jointBoneIdx !== -1) {
                    handMeshSkeleton.bones[jointBoneIdx].linkTransformNode(this._jointTransforms[jointIdx]);
                }
            }
        }

        this.onHandMeshSetObservable.notifyObservers(this);
    }

    /**
     * Update this hand from the latest xr frame.
     * @param xrFrame The latest frame received from WebXR.
     * @param referenceSpace The current viewer reference space.
     */
    public updateFromXRFrame(xrFrame: XRFrame, referenceSpace: XRReferenceSpace) {
        const hand = this.xrController.inputSource.hand;
        if (!hand) {
            return;
        }

        // TODO: Modify webxr.d.ts to better match WebXR IDL so we don't need this any cast.
        const anyHand: any = hand;
        const jointSpaces: XRJointSpace[] = HandJointReferenceArray.map((jointName) => anyHand[jointName] || hand.get(jointName));
        let trackingSuccessful = false;

        if (xrFrame.fillPoses && xrFrame.fillJointRadii) {
            trackingSuccessful = xrFrame.fillPoses(jointSpaces, referenceSpace, this._jointTransformMatrices) && xrFrame.fillJointRadii(jointSpaces, this._jointRadii);
        } else if (xrFrame.getJointPose) {
            trackingSuccessful = true;
            // Warning: This codepath is slow by comparison, only here for compat.
            for (let jointIdx = 0; jointIdx < jointSpaces.length; jointIdx++) {
                const jointPose = xrFrame.getJointPose(jointSpaces[jointIdx], referenceSpace);
                if (jointPose) {
                    this._jointTransformMatrices.set(jointPose.transform.matrix, jointIdx * 16);
                    this._jointRadii[jointIdx] = jointPose.radius || 0.008;
                } else {
                    trackingSuccessful = false;
                    break;
                }
            }
        }

        if (!trackingSuccessful) {
            return;
        }

        for (let jointIdx = 0; jointIdx < HandJointReferenceArray.length; jointIdx++) {
            const jointTransform = this._jointTransforms[jointIdx];
            Matrix.FromArrayToRef(this._jointTransformMatrices, jointIdx * 16, this._tempJointMatrix);
            this._tempJointMatrix.decompose(undefined, jointTransform.rotationQuaternion!, jointTransform.position);

            // The radius we need to make the joint in order for it to roughly cover the joints of the user's real hand.
            const scaledJointRadius = this._jointRadii[jointIdx] * this._jointScaleFactor;

            const jointMesh = this._jointMeshes[jointIdx];
            jointMesh.isVisible = !this._handMesh && !this._jointsInvisible;
            jointMesh.position.copyFrom(jointTransform.position);
            jointMesh.rotationQuaternion!.copyFrom(jointTransform.rotationQuaternion!);
            jointMesh.scaling.setAll(scaledJointRadius);

            // The WebXR data comes as right-handed, so we might need to do some conversions.
            if (!this._scene.useRightHandedSystem) {
                jointMesh.position.z *= -1;
                jointMesh.rotationQuaternion!.z *= -1;
                jointMesh.rotationQuaternion!.w *= -1;

                if (this._leftHandedMeshes && this._handMesh) {
                    jointTransform.position.z *= -1;
                    jointTransform.rotationQuaternion!.z *= -1;
                    jointTransform.rotationQuaternion!.w *= -1;
                }
            }
        }

        if (this._handMesh) {
            this._handMesh.isVisible = true;
        }
    }

    /**
     * Dispose this Hand object
     * @param disposeMeshes Should the meshes be disposed as well
     */
    public dispose(disposeMeshes = false) {
        if (this._handMesh) {
            if (disposeMeshes) {
                this._handMesh.skeleton?.dispose();
                this._handMesh.dispose(false, true);
            } else {
                this._handMesh.isVisible = false;
            }
        }
        for (const transform of this._jointTransforms) {
            transform.dispose();
        }
        this._jointTransforms.length = 0;
        this.onHandMeshSetObservable.clear();
    }
}

/**
 * WebXR Hand Joint tracking feature, available for selected browsers and devices
 */
export class WebXRHandTracking extends WebXRAbstractFeature {
    /**
     * The module's name
     */
    public static readonly Name = WebXRFeatureName.HAND_TRACKING;
    /**
     * The (Babylon) version of this module.
     * This is an integer representing the implementation version.
     * This number does not correspond to the WebXR specs version
     */
    public static readonly Version = 1;

    /** The base URL for the default hand model. */
    public static DEFAULT_HAND_MODEL_BASE_URL = "https://assets.babylonjs.com/core/HandMeshes/";
    /** The filename to use for the default right hand model. */
    public static DEFAULT_HAND_MODEL_RIGHT_FILENAME = "r_hand_rhs.glb";
    /** The filename to use for the default left hand model. */
    public static DEFAULT_HAND_MODEL_LEFT_FILENAME = "l_hand_rhs.glb";
    /** The URL pointing to the default hand model NodeMaterial shader. */
    public static DEFAULT_HAND_MODEL_SHADER_URL = "https://assets.babylonjs.com/core/HandMeshes/handsShader.json";

    // We want to use lightweight models, diameter will initially be 1 but scaled to the values returned from WebXR.
    private static readonly _ICOSPHERE_PARAMS = { radius: 0.5, flat: false, subdivisions: 2 };

    private static _RightHandGLB: Nullable<ISceneLoaderAsyncResult> = null;
    private static _LeftHandGLB: Nullable<ISceneLoaderAsyncResult> = null;

    private static _GenerateTrackedJointMeshes(
        featureOptions: IWebXRHandTrackingOptions,
        originalMesh: Mesh = CreateIcoSphere("jointParent", WebXRHandTracking._ICOSPHERE_PARAMS)
    ): { left: AbstractMesh[]; right: AbstractMesh[] } {
        const meshes: { [handedness: string]: AbstractMesh[] } = {};
        ["left" as XRHandedness, "right" as XRHandedness].map((handedness) => {
            const trackedMeshes = [];
            originalMesh.isVisible = !!featureOptions.jointMeshes?.keepOriginalVisible;
            for (let i = 0; i < HandJointReferenceArray.length; ++i) {
                let newInstance: AbstractMesh = originalMesh.createInstance(`${handedness}-handJoint-${i}`);
                if (featureOptions.jointMeshes?.onHandJointMeshGenerated) {
                    const returnedMesh = featureOptions.jointMeshes.onHandJointMeshGenerated(newInstance as InstancedMesh, i, handedness);
                    if (returnedMesh) {
                        if (returnedMesh !== newInstance) {
                            newInstance.dispose();
                            newInstance = returnedMesh;
                        }
                    }
                }
                newInstance.isPickable = false;
                if (featureOptions.jointMeshes?.enablePhysics) {
                    const props = featureOptions.jointMeshes?.physicsProps || {};
                    // downscale the instances so that physics will be initialized correctly
                    newInstance.scaling.setAll(0.02);
                    const type = props.impostorType !== undefined ? props.impostorType : PhysicsImpostor.SphereImpostor;
                    newInstance.physicsImpostor = new PhysicsImpostor(newInstance, type, { mass: 0, ...props });
                }
                newInstance.rotationQuaternion = new Quaternion();
                newInstance.isVisible = false;
                trackedMeshes.push(newInstance);
            }

            meshes[handedness] = trackedMeshes;
        });
        return { left: meshes.left, right: meshes.right };
    }

    private static async _GenerateDefaultHandMeshesAsync(
        scene: Scene,
        xrSessionManager: WebXRSessionManager,
        options?: IWebXRHandTrackingOptions
    ): Promise<{ left: AbstractMesh; right: AbstractMesh }> {
        // eslint-disable-next-line no-async-promise-executor, @typescript-eslint/no-misused-promises
        return await new Promise(async (resolve) => {
            const riggedMeshes: { [handedness: string]: AbstractMesh } = {};
            // check the cache, defensive
            if (WebXRHandTracking._RightHandGLB?.meshes[1]?.isDisposed()) {
                WebXRHandTracking._RightHandGLB = null;
            }
            if (WebXRHandTracking._LeftHandGLB?.meshes[1]?.isDisposed()) {
                WebXRHandTracking._LeftHandGLB = null;
            }

            const handsDefined = !!(WebXRHandTracking._RightHandGLB && WebXRHandTracking._LeftHandGLB);
            // load them in parallel
            const defaulrHandGLBUrl = Tools.GetAssetUrl(WebXRHandTracking.DEFAULT_HAND_MODEL_BASE_URL);
            const handGLBs = await Promise.all([
                WebXRHandTracking._RightHandGLB || SceneLoader.ImportMeshAsync("", defaulrHandGLBUrl, WebXRHandTracking.DEFAULT_HAND_MODEL_RIGHT_FILENAME, scene),
                WebXRHandTracking._LeftHandGLB || SceneLoader.ImportMeshAsync("", defaulrHandGLBUrl, WebXRHandTracking.DEFAULT_HAND_MODEL_LEFT_FILENAME, scene),
            ]);
            // eslint-disable-next-line require-atomic-updates
            WebXRHandTracking._RightHandGLB = handGLBs[0];
            // eslint-disable-next-line require-atomic-updates
            WebXRHandTracking._LeftHandGLB = handGLBs[1];
            const shaderUrl = Tools.GetAssetUrl(WebXRHandTracking.DEFAULT_HAND_MODEL_SHADER_URL);
            const handShader = await NodeMaterial.ParseFromFileAsync("handShader", shaderUrl, scene, undefined, true);

            // depth prepass and alpha mode
            handShader.needDepthPrePass = true;
            handShader.transparencyMode = Material.MATERIAL_ALPHABLEND;
            handShader.alphaMode = Constants.ALPHA_COMBINE;

            // build node materials
            handShader.build(false);

            // shader
            const handColors = {
                base: Color3.FromInts(116, 63, 203),
                fresnel: Color3.FromInts(149, 102, 229),
                fingerColor: Color3.FromInts(177, 130, 255),
                tipFresnel: Color3.FromInts(220, 200, 255),
                ...options?.handMeshes?.customColors,
            };

            const handNodes = {
                base: handShader.getBlockByName("baseColor") as InputBlock,
                fresnel: handShader.getBlockByName("fresnelColor") as InputBlock,
                fingerColor: handShader.getBlockByName("fingerColor") as InputBlock,
                tipFresnel: handShader.getBlockByName("tipFresnelColor") as InputBlock,
            };

            handNodes.base.value = handColors.base;
            handNodes.fresnel.value = handColors.fresnel;
            handNodes.fingerColor.value = handColors.fingerColor;
            handNodes.tipFresnel.value = handColors.tipFresnel;
            const isMultiview = (xrSessionManager._getBaseLayerWrapper() as WebXRCompositionLayerWrapper)?.isMultiview;
            const hd = ["left", "right"];
            for (const handedness of hd) {
                const handGLB = handedness == "left" ? WebXRHandTracking._LeftHandGLB : WebXRHandTracking._RightHandGLB;
                if (!handGLB) {
                    // this should never happen!
                    throw new Error("Could not load hand model");
                }
                const handMesh = handGLB.meshes[1];
                handMesh._internalAbstractMeshDataInfo._computeBonesUsingShaders = true;
                // if in multiview do not use the material
                if (!isMultiview && !options?.handMeshes?.disableHandShader) {
                    handMesh.material = handShader.clone(`${handedness}HandShaderClone`, true);
                }
                handMesh.isVisible = false;

                riggedMeshes[handedness] = handMesh;

                // single change for left handed systems
                if (!handsDefined && !scene.useRightHandedSystem) {
                    handGLB.meshes[1].rotate(Axis.Y, Math.PI);
                }
            }

            handShader.dispose();
            resolve({ left: riggedMeshes.left, right: riggedMeshes.right });
        });
    }

    /**
     * Generates a mapping from XRHandJoint to bone name for the default hand mesh.
     * @param handedness The handedness being mapped for.
     * @returns A mapping from XRHandJoint to bone name.
     */
    private static _GenerateDefaultHandMeshRigMapping(handedness: XRHandedness): XRHandMeshRigMapping {
        const h = handedness == "right" ? "R" : "L";
        return {
            [WebXRHandJoint.WRIST]: `wrist_${h}`,
            [WebXRHandJoint.THUMB_METACARPAL]: `thumb_metacarpal_${h}`,
            [WebXRHandJoint.THUMB_PHALANX_PROXIMAL]: `thumb_proxPhalanx_${h}`,
            [WebXRHandJoint.THUMB_PHALANX_DISTAL]: `thumb_distPhalanx_${h}`,
            [WebXRHandJoint.THUMB_TIP]: `thumb_tip_${h}`,
            [WebXRHandJoint.INDEX_FINGER_METACARPAL]: `index_metacarpal_${h}`,
            [WebXRHandJoint.INDEX_FINGER_PHALANX_PROXIMAL]: `index_proxPhalanx_${h}`,
            [WebXRHandJoint.INDEX_FINGER_PHALANX_INTERMEDIATE]: `index_intPhalanx_${h}`,
            [WebXRHandJoint.INDEX_FINGER_PHALANX_DISTAL]: `index_distPhalanx_${h}`,
            [WebXRHandJoint.INDEX_FINGER_TIP]: `index_tip_${h}`,
            [WebXRHandJoint.MIDDLE_FINGER_METACARPAL]: `middle_metacarpal_${h}`,
            [WebXRHandJoint.MIDDLE_FINGER_PHALANX_PROXIMAL]: `middle_proxPhalanx_${h}`,
            [WebXRHandJoint.MIDDLE_FINGER_PHALANX_INTERMEDIATE]: `middle_intPhalanx_${h}`,
            [WebXRHandJoint.MIDDLE_FINGER_PHALANX_DISTAL]: `middle_distPhalanx_${h}`,
            [WebXRHandJoint.MIDDLE_FINGER_TIP]: `middle_tip_${h}`,
            [WebXRHandJoint.RING_FINGER_METACARPAL]: `ring_metacarpal_${h}`,
            [WebXRHandJoint.RING_FINGER_PHALANX_PROXIMAL]: `ring_proxPhalanx_${h}`,
            [WebXRHandJoint.RING_FINGER_PHALANX_INTERMEDIATE]: `ring_intPhalanx_${h}`,
            [WebXRHandJoint.RING_FINGER_PHALANX_DISTAL]: `ring_distPhalanx_${h}`,
            [WebXRHandJoint.RING_FINGER_TIP]: `ring_tip_${h}`,
            [WebXRHandJoint.PINKY_FINGER_METACARPAL]: `little_metacarpal_${h}`,
            [WebXRHandJoint.PINKY_FINGER_PHALANX_PROXIMAL]: `little_proxPhalanx_${h}`,
            [WebXRHandJoint.PINKY_FINGER_PHALANX_INTERMEDIATE]: `little_intPhalanx_${h}`,
            [WebXRHandJoint.PINKY_FINGER_PHALANX_DISTAL]: `little_distPhalanx_${h}`,
            [WebXRHandJoint.PINKY_FINGER_TIP]: `little_tip_${h}`,
        };
    }

    private _attachedHands: {
        [uniqueId: string]: WebXRHand;
    } = {};

    private _trackingHands: {
        left: Nullable<WebXRHand>;
        right: Nullable<WebXRHand>;
    } = { left: null, right: null };

    private _handResources: {
        jointMeshes: Nullable<{ left: AbstractMesh[]; right: AbstractMesh[] }>;
        handMeshes: Nullable<{ left: AbstractMesh; right: AbstractMesh }>;
        rigMappings: Nullable<{ left: XRHandMeshRigMapping; right: XRHandMeshRigMapping }>;
    } = { jointMeshes: null, handMeshes: null, rigMappings: null };

    private _worldScaleObserver?: Nullable<Observer<{ previousScaleFactor: number; newScaleFactor: number }>> = null;

    /**
     * This observable will notify registered observers when a new hand object was added and initialized
     */
    public onHandAddedObservable: Observable<WebXRHand> = new Observable();
    /**
     * This observable will notify its observers right before the hand object is disposed
     */
    public onHandRemovedObservable: Observable<WebXRHand> = new Observable();

    private _originalMesh?: Mesh;

    /**
     * Check if the needed objects are defined.
     * This does not mean that the feature is enabled, but that the objects needed are well defined.
     * @returns true if the needed objects for this feature are defined
     */
    public override isCompatible(): boolean {
        return typeof XRHand !== "undefined";
    }

    /**
     * Get the hand object according to the controller id
     * @param controllerId the controller id to which we want to get the hand
     * @returns null if not found or the WebXRHand object if found
     */
    public getHandByControllerId(controllerId: string): Nullable<WebXRHand> {
        return this._attachedHands[controllerId];
    }

    /**
     * Get a hand object according to the requested handedness
     * @param handedness the handedness to request
     * @returns null if not found or the WebXRHand object if found
     */
    public getHandByHandedness(handedness: XRHandedness): Nullable<WebXRHand> {
        if (handedness == "none") {
            return null;
        }
        return this._trackingHands[handedness];
    }

    /**
     * Creates a new instance of the XR hand tracking feature.
     * @param _xrSessionManager An instance of WebXRSessionManager.
     * @param options Options to use when constructing this feature.
     */
    constructor(
        _xrSessionManager: WebXRSessionManager,
        /** Options to use when constructing this feature. */
        public readonly options: IWebXRHandTrackingOptions
    ) {
        super(_xrSessionManager);
        this.xrNativeFeatureName = "hand-tracking";

        // Support legacy versions of the options object by copying over joint mesh properties
        const anyOptions = options as any;
        const anyJointMeshOptions = anyOptions.jointMeshes;
        if (anyJointMeshOptions) {
            if (typeof anyJointMeshOptions.disableDefaultHandMesh !== "undefined") {
                options.handMeshes = options.handMeshes || {};
                options.handMeshes.disableDefaultMeshes = anyJointMeshOptions.disableDefaultHandMesh;
            }
            if (typeof anyJointMeshOptions.handMeshes !== "undefined") {
                options.handMeshes = options.handMeshes || {};
                options.handMeshes.customMeshes = anyJointMeshOptions.handMeshes;
            }
            if (typeof anyJointMeshOptions.leftHandedSystemMeshes !== "undefined") {
                options.handMeshes = options.handMeshes || {};
                options.handMeshes.meshesUseLeftHandedCoordinates = anyJointMeshOptions.leftHandedSystemMeshes;
            }
            if (typeof anyJointMeshOptions.rigMapping !== "undefined") {
                options.handMeshes = options.handMeshes || {};
                const leftRigMapping = {};
                const rightRigMapping = {};
                const rigMappingTuples = [
                    [anyJointMeshOptions.rigMapping.left, leftRigMapping],
                    [anyJointMeshOptions.rigMapping.right, rightRigMapping],
                ];

                for (const rigMappingTuple of rigMappingTuples) {
                    const legacyRigMapping = rigMappingTuple[0] as string[];
                    const rigMapping = rigMappingTuple[1] as XRHandMeshRigMapping;
                    for (let index = 0; index < legacyRigMapping.length; index++) {
                        const modelJointName = legacyRigMapping[index];
                        rigMapping[HandJointReferenceArray[index]] = modelJointName;
                    }
                }
                options.handMeshes.customRigMappings = {
                    left: leftRigMapping as XRHandMeshRigMapping,
                    right: rightRigMapping as XRHandMeshRigMapping,
                };
            }
        }
    }

    /**
     * Attach this feature.
     * Will usually be called by the features manager.
     *
     * @returns true if successful.
     */
    public override attach(): boolean {
        if (!super.attach()) {
            return false;
        }

        if (!this._handResources.jointMeshes) {
            this._originalMesh = this._originalMesh || this.options.jointMeshes?.sourceMesh || CreateIcoSphere("jointParent", WebXRHandTracking._ICOSPHERE_PARAMS);
            this._originalMesh.isVisible = false;

            this._handResources.jointMeshes = WebXRHandTracking._GenerateTrackedJointMeshes(this.options, this._originalMesh);
        }
        this._handResources.handMeshes = this.options.handMeshes?.customMeshes || null;
        this._handResources.rigMappings = this.options.handMeshes?.customRigMappings || null;
        // If they didn't supply custom meshes and are not disabling the default meshes...
        if (!this.options.handMeshes?.customMeshes && !this.options.handMeshes?.disableDefaultMeshes) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises, github/no-then
            WebXRHandTracking._GenerateDefaultHandMeshesAsync(EngineStore.LastCreatedScene!, this._xrSessionManager, this.options).then((defaultHandMeshes) => {
                this._handResources.handMeshes = defaultHandMeshes;
                this._handResources.rigMappings = {
                    left: WebXRHandTracking._GenerateDefaultHandMeshRigMapping("left"),
                    right: WebXRHandTracking._GenerateDefaultHandMeshRigMapping("right"),
                };

                // Apply meshes to existing hands if already tracking.
                this._trackingHands.left?.setHandMesh(this._handResources.handMeshes.left, this._handResources.rigMappings.left, this._xrSessionManager);
                this._trackingHands.right?.setHandMesh(this._handResources.handMeshes.right, this._handResources.rigMappings.right, this._xrSessionManager);
                this._handResources.handMeshes.left.scaling.setAll(this._xrSessionManager.worldScalingFactor);
                this._handResources.handMeshes.right.scaling.setAll(this._xrSessionManager.worldScalingFactor);
            });
            this._worldScaleObserver = this._xrSessionManager.onWorldScaleFactorChangedObservable.add((scalingFactors) => {
                if (this._handResources.handMeshes) {
                    this._handResources.handMeshes.left.scaling.scaleInPlace(scalingFactors.newScaleFactor / scalingFactors.previousScaleFactor);
                    this._handResources.handMeshes.right.scaling.scaleInPlace(scalingFactors.newScaleFactor / scalingFactors.previousScaleFactor);
                }
            });
        }

        for (const controller of this.options.xrInput.controllers) {
            this._attachHand(controller);
        }

        this._addNewAttachObserver(this.options.xrInput.onControllerAddedObservable, this._attachHand);
        this._addNewAttachObserver(this.options.xrInput.onControllerRemovedObservable, this._detachHand);

        return true;
    }

    protected _onXRFrame(_xrFrame: XRFrame): void {
        this._trackingHands.left?.updateFromXRFrame(_xrFrame, this._xrSessionManager.referenceSpace);
        this._trackingHands.right?.updateFromXRFrame(_xrFrame, this._xrSessionManager.referenceSpace);
    }

    private _attachHand = (xrController: WebXRInputSource) => {
        if (!xrController.inputSource.hand || xrController.inputSource.handedness == "none" || !this._handResources.jointMeshes) {
            return;
        }

        const handedness = xrController.inputSource.handedness;
        const webxrHand = new WebXRHand(
            xrController,
            this._handResources.jointMeshes[handedness],
            this._handResources.handMeshes && this._handResources.handMeshes[handedness],
            this._handResources.rigMappings && this._handResources.rigMappings[handedness],
            this.options.handMeshes?.meshesUseLeftHandedCoordinates,
            this.options.jointMeshes?.invisible,
            this.options.jointMeshes?.scaleFactor
        );

        this._attachedHands[xrController.uniqueId] = webxrHand;
        this._trackingHands[handedness] = webxrHand;

        this.onHandAddedObservable.notifyObservers(webxrHand);
    };

    private _detachHandById(controllerId: string, disposeMesh?: boolean) {
        const hand = this.getHandByControllerId(controllerId);
        if (hand) {
            const handedness = hand.xrController.inputSource.handedness == "left" ? "left" : "right";
            if (this._trackingHands[handedness]?.xrController.uniqueId === controllerId) {
                this._trackingHands[handedness] = null;
            }
            this.onHandRemovedObservable.notifyObservers(hand);
            hand.dispose(disposeMesh);
            delete this._attachedHands[controllerId];
        }
    }

    private _detachHand = (xrController: WebXRInputSource) => {
        this._detachHandById(xrController.uniqueId);
    };

    /**
     * Detach this feature.
     * Will usually be called by the features manager.
     *
     * @returns true if successful.
     */
    public override detach(): boolean {
        if (!super.detach()) {
            return false;
        }

        const keys = Object.keys(this._attachedHands);
        for (const uniqueId of keys) {
            this._detachHandById(uniqueId, this.options.handMeshes?.disposeOnSessionEnd);
        }

        if (this.options.handMeshes?.disposeOnSessionEnd) {
            if (this._handResources.jointMeshes) {
                for (const trackedMesh of this._handResources.jointMeshes.left) {
                    trackedMesh.dispose();
                }
                for (const trackedMesh of this._handResources.jointMeshes.right) {
                    trackedMesh.dispose();
                }
                this._handResources.jointMeshes = null;
            }
            if (this._handResources.handMeshes) {
                this._handResources.handMeshes.left.dispose();
                this._handResources.handMeshes.right.dispose();
                this._handResources.handMeshes = null;
            }

            if (WebXRHandTracking._RightHandGLB) {
                for (const mesh of WebXRHandTracking._RightHandGLB.meshes) {
                    mesh.dispose();
                }
            }
            if (WebXRHandTracking._LeftHandGLB) {
                for (const mesh of WebXRHandTracking._LeftHandGLB.meshes) {
                    mesh.dispose();
                }
            }
            WebXRHandTracking._RightHandGLB = null;
            WebXRHandTracking._LeftHandGLB = null;
            this._originalMesh?.dispose();
            this._originalMesh = undefined;
        }

        // remove world scale observer
        if (this._worldScaleObserver) {
            this._xrSessionManager.onWorldScaleFactorChangedObservable.remove(this._worldScaleObserver);
        }

        return true;
    }

    /**
     * Dispose this feature and all of the resources attached.
     */
    public override dispose(): void {
        super.dispose();
        this.onHandAddedObservable.clear();
        this.onHandRemovedObservable.clear();

        if (this._handResources.handMeshes && !this.options.handMeshes?.customMeshes) {
            // this will dispose the cached meshes
            this._handResources.handMeshes.left.dispose();
            this._handResources.handMeshes.right.dispose();
            // remove the cached meshes

            if (WebXRHandTracking._RightHandGLB) {
                for (const mesh of WebXRHandTracking._RightHandGLB.meshes) {
                    mesh.dispose();
                }
            }
            if (WebXRHandTracking._LeftHandGLB) {
                for (const mesh of WebXRHandTracking._LeftHandGLB.meshes) {
                    mesh.dispose();
                }
            }
            WebXRHandTracking._RightHandGLB = null;
            WebXRHandTracking._LeftHandGLB = null;
        }

        if (this._handResources.jointMeshes) {
            for (const trackedMesh of this._handResources.jointMeshes.left) {
                trackedMesh.dispose();
            }
            for (const trackedMesh of this._handResources.jointMeshes.right) {
                trackedMesh.dispose();
            }
        }
    }
}

//register the plugin
WebXRFeaturesManager.AddWebXRFeature(
    WebXRHandTracking.Name,
    (xrSessionManager, options) => {
        return () => new WebXRHandTracking(xrSessionManager, options);
    },
    WebXRHandTracking.Version,
    false
);
