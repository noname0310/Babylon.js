import type { Behavior } from "../../Behaviors/behavior";
import { Mesh } from "../../Meshes/mesh";
import type { AbstractMesh } from "../../Meshes/abstractMesh";
import { Scene } from "../../scene";
import type { Nullable } from "../../types";
import type { Observer } from "../../Misc/observable";
import { Observable } from "../../Misc/observable";
import { TmpVectors, Vector3 } from "../../Maths/math.vector";
import type { PointerInfo } from "../../Events/pointerEvents";
import { PointerEventTypes } from "../../Events/pointerEvents";
import { Ray } from "../../Culling/ray";
import { PivotTools } from "../../Misc/pivotTools";
import type { ArcRotateCamera } from "../../Cameras/arcRotateCamera";
import { CreatePlane } from "../../Meshes/Builders/planeBuilder";

import type { IPointerEvent } from "../../Events/deviceInputEvents";
import { Epsilon } from "../../Maths/math.constants";

/**
 * A behavior that when attached to a mesh will allow the mesh to be dragged around the screen based on pointer events
 */
export class PointerDragBehavior implements Behavior<AbstractMesh> {
    private static _AnyMouseId = -2;
    /**
     * Abstract mesh the behavior is set on
     */
    public attachedNode: AbstractMesh;
    protected _dragPlane: Mesh;
    private _scene: Scene;
    private _pointerObserver: Nullable<Observer<PointerInfo>>;
    private _beforeRenderObserver: Nullable<Observer<Scene>>;
    private static _PlaneScene: Scene;
    private _useAlternatePickedPointAboveMaxDragAngleDragSpeed = -1.1;
    private _activeDragButton: number = -1;
    private _activePointerInfo: Nullable<PointerInfo>;
    /**
     * The maximum tolerated angle between the drag plane and dragging pointer rays to trigger pointer events. Set to 0 to allow any angle (default: 0)
     */
    public maxDragAngle = 0;
    /**
     * Butttons that can be used to initiate a drag
     */
    public dragButtons = [0, 1, 2];
    /**
     * @internal
     */
    public _useAlternatePickedPointAboveMaxDragAngle = false;
    /**
     * Get or set the currentDraggingPointerId
     * @deprecated Please use currentDraggingPointerId instead
     */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public get currentDraggingPointerID(): number {
        return this.currentDraggingPointerId;
    }
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public set currentDraggingPointerID(currentDraggingPointerId: number) {
        this.currentDraggingPointerId = currentDraggingPointerId;
    }
    /**
     * The id of the pointer that is currently interacting with the behavior (-1 when no pointer is active)
     */
    public currentDraggingPointerId = -1;
    /**
     * The last position where the pointer hit the drag plane in world space
     */
    public lastDragPosition: Vector3;
    /**
     * If the behavior is currently in a dragging state
     */
    public dragging = false;
    /**
     * The distance towards the target drag position to move each frame. This can be useful to avoid jitter. Set this to 1 for no delay. (Default: 0.2)
     */
    public dragDeltaRatio = 0.2;
    /**
     * If the drag plane orientation should be updated during the dragging (Default: true)
     */
    public updateDragPlane = true;
    // Debug mode will display drag planes to help visualize behavior
    private _debugMode = false;
    private _moving = false;
    /**
     *  Fires each time the attached mesh is dragged with the pointer
     *  * delta between last drag position and current drag position in world space
     *  * dragDistance along the drag axis
     *  * dragPlaneNormal normal of the current drag plane used during the drag
     *  * dragPlanePoint in world space where the drag intersects the drag plane
     *
     *  (if validatedDrag is used, the position of the attached mesh might not equal dragPlanePoint)
     */
    public onDragObservable = new Observable<{
        delta: Vector3;
        dragPlanePoint: Vector3;
        dragPlaneNormal: Vector3;
        dragDistance: number;
        pointerId: number;
        pointerInfo: Nullable<PointerInfo>;
    }>();
    /**
     *  Fires each time a drag begins (eg. mouse down on mesh)
     *  * dragPlanePoint in world space where the drag intersects the drag plane
     *
     *  (if validatedDrag is used, the position of the attached mesh might not equal dragPlanePoint)
     */
    public onDragStartObservable = new Observable<{ dragPlanePoint: Vector3; pointerId: number; pointerInfo: Nullable<PointerInfo> }>();
    /**
     *  Fires each time a drag ends (eg. mouse release after drag)
     *  * dragPlanePoint in world space where the drag intersects the drag plane
     *
     *  (if validatedDrag is used, the position of the attached mesh might not equal dragPlanePoint)
     */
    public onDragEndObservable = new Observable<{ dragPlanePoint: Vector3; pointerId: number; pointerInfo: Nullable<PointerInfo> }>();
    /**
     *  Fires each time behavior enabled state changes
     */
    public onEnabledObservable = new Observable<boolean>();

    /**
     *  If the attached mesh should be moved when dragged
     */
    public moveAttached = true;

    /**
     *  If the drag behavior will react to drag events (Default: true)
     */
    public set enabled(value: boolean) {
        if (value != this._enabled) {
            this.onEnabledObservable.notifyObservers(value);
        }
        this._enabled = value;
    }

    public get enabled() {
        return this._enabled;
    }
    private _enabled = true;

    /**
     * If pointer events should start and release the drag (Default: true)
     */
    public startAndReleaseDragOnPointerEvents = true;
    /**
     * If camera controls should be detached during the drag
     */
    public detachCameraControls = true;

    /**
     * If set, the drag plane/axis will be rotated based on the attached mesh's world rotation (Default: true)
     */
    public useObjectOrientationForDragging = true;

    /**
     * Normally a drag is canceled when the user presses another button on the same pointer. If this is set to true,
     * the drag will continue even if another button is pressed on the same pointer.
     */
    public allowOtherButtonsDuringDrag = false;

    private _options: { dragAxis?: Vector3; dragPlaneNormal?: Vector3 };

    /**
     * Gets the options used by the behavior
     */
    public get options(): { dragAxis?: Vector3; dragPlaneNormal?: Vector3 } {
        return this._options;
    }

    /**
     * Sets the options used by the behavior
     */
    public set options(options: { dragAxis?: Vector3; dragPlaneNormal?: Vector3 }) {
        this._options = options;
    }

    /**
     * Creates a pointer drag behavior that can be attached to a mesh
     * @param options The drag axis or normal of the plane that will be dragged across. If no options are specified the drag plane will always face the ray's origin (eg. camera)
     * @param options.dragAxis
     * @param options.dragPlaneNormal
     */
    constructor(options?: { dragAxis?: Vector3; dragPlaneNormal?: Vector3 }) {
        this._options = options ? options : {};

        let optionCount = 0;
        if (this._options.dragAxis) {
            optionCount++;
        }
        if (this._options.dragPlaneNormal) {
            optionCount++;
        }
        if (optionCount > 1) {
            // eslint-disable-next-line no-throw-literal
            throw "Multiple drag modes specified in dragBehavior options. Only one expected";
        }
    }

    /**
     * Predicate to determine if it is valid to move the object to a new position when it is moved.
     * In the case of rotation gizmo, target contains the angle.
     * @param target destination position or desired angle delta
     * @returns boolean for whether or not it is valid to move
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public validateDrag = (target: Vector3) => {
        return true;
    };

    /**
     *  The name of the behavior
     */
    public get name(): string {
        return "PointerDrag";
    }

    /**
     *  Initializes the behavior
     */
    public init() {}

    private _tmpVector = new Vector3(0, 0, 0);
    private _alternatePickedPoint = new Vector3(0, 0, 0);
    private _worldDragAxis = new Vector3(0, 0, 0);
    private _targetPosition = new Vector3(0, 0, 0);
    private _attachedToElement: boolean = false;
    /**
     * Attaches the drag behavior the passed in mesh
     * @param ownerNode The mesh that will be dragged around once attached
     * @param predicate Predicate to use for pick filtering
     */
    public attach(ownerNode: AbstractMesh, predicate?: (m: AbstractMesh) => boolean): void {
        this._scene = ownerNode.getScene();
        ownerNode.isNearGrabbable = true;
        this.attachedNode = ownerNode;

        // Initialize drag plane to not interfere with existing scene
        if (!PointerDragBehavior._PlaneScene) {
            if (this._debugMode) {
                PointerDragBehavior._PlaneScene = this._scene;
            } else {
                PointerDragBehavior._PlaneScene = new Scene(this._scene.getEngine(), { virtual: true });
                PointerDragBehavior._PlaneScene.detachControl();
                this._scene.onDisposeObservable.addOnce(() => {
                    PointerDragBehavior._PlaneScene.dispose();
                    (<any>PointerDragBehavior._PlaneScene) = null;
                });
            }
        }
        this._dragPlane = CreatePlane(
            "pointerDragPlane",
            { size: this._debugMode ? 1 : 10000, updatable: false, sideOrientation: Mesh.DOUBLESIDE },
            PointerDragBehavior._PlaneScene
        );

        // State of the drag
        this.lastDragPosition = new Vector3(0, 0, 0);

        const pickPredicate = predicate
            ? predicate
            : (m: AbstractMesh) => {
                  return this.attachedNode == m || m.isDescendantOf(this.attachedNode);
              };

        this._pointerObserver = this._scene.onPointerObservable.add((pointerInfo) => {
            if (!this.enabled) {
                // If behavior is disabled before releaseDrag is ever called, call it now.
                if (this._attachedToElement) {
                    this.releaseDrag();
                }

                return;
            }

            // If we are dragging and the user presses another button on the same pointer, end the drag. Otherwise,
            // tracking when the drag should end becomes very complex.
            // gizmo.ts has similar behavior.
            if (
                this.dragging &&
                this.currentDraggingPointerId == (<IPointerEvent>pointerInfo.event).pointerId &&
                pointerInfo.event.button !== -1 &&
                pointerInfo.event.button !== this._activeDragButton &&
                !this.allowOtherButtonsDuringDrag
            ) {
                this.releaseDrag();
                return;
            }

            if (pointerInfo.type == PointerEventTypes.POINTERDOWN) {
                if (
                    this.startAndReleaseDragOnPointerEvents &&
                    !this.dragging &&
                    pointerInfo.pickInfo &&
                    pointerInfo.pickInfo.hit &&
                    pointerInfo.pickInfo.pickedMesh &&
                    pointerInfo.pickInfo.pickedPoint &&
                    pointerInfo.pickInfo.ray &&
                    pickPredicate(pointerInfo.pickInfo.pickedMesh)
                ) {
                    if (this._activeDragButton === -1 && this.dragButtons.indexOf(pointerInfo.event.button) !== -1) {
                        this._activeDragButton = pointerInfo.event.button;
                        this._activePointerInfo = pointerInfo;
                        this._startDrag((<IPointerEvent>pointerInfo.event).pointerId, pointerInfo.pickInfo.ray, pointerInfo.pickInfo.pickedPoint);
                    }
                }
            } else if (pointerInfo.type == PointerEventTypes.POINTERUP) {
                if (
                    this.startAndReleaseDragOnPointerEvents &&
                    this.currentDraggingPointerId == (<IPointerEvent>pointerInfo.event).pointerId &&
                    (this._activeDragButton === pointerInfo.event.button || this._activeDragButton === -1)
                ) {
                    this.releaseDrag();
                }
            } else if (pointerInfo.type == PointerEventTypes.POINTERMOVE) {
                const pointerId = (<IPointerEvent>pointerInfo.event).pointerId;

                // If drag was started with anyMouseID specified, set pointerID to the next mouse that moved
                if (this.currentDraggingPointerId === PointerDragBehavior._AnyMouseId && pointerId !== PointerDragBehavior._AnyMouseId) {
                    const evt = <IPointerEvent>pointerInfo.event;
                    const isMouseEvent = evt.pointerType === "mouse" || (!this._scene.getEngine().hostInformation.isMobile && evt instanceof MouseEvent);
                    if (isMouseEvent) {
                        if (this._lastPointerRay[this.currentDraggingPointerId]) {
                            this._lastPointerRay[pointerId] = this._lastPointerRay[this.currentDraggingPointerId];
                            delete this._lastPointerRay[this.currentDraggingPointerId];
                        }
                        this.currentDraggingPointerId = pointerId;
                    }
                }

                // Keep track of last pointer ray, this is used simulating the start of a drag in startDrag()
                if (!this._lastPointerRay[pointerId]) {
                    this._lastPointerRay[pointerId] = new Ray(new Vector3(), new Vector3());
                }
                if (pointerInfo.pickInfo && pointerInfo.pickInfo.ray) {
                    this._lastPointerRay[pointerId].origin.copyFrom(pointerInfo.pickInfo.ray.origin);
                    this._lastPointerRay[pointerId].direction.copyFrom(pointerInfo.pickInfo.ray.direction);

                    if (this.currentDraggingPointerId == pointerId && this.dragging) {
                        this._moveDrag(pointerInfo.pickInfo.ray);
                    }
                }
            }
        });

        this._beforeRenderObserver = this._scene.onBeforeRenderObservable.add(() => {
            if (this._moving && this.moveAttached) {
                let needMatrixUpdate = false;
                PivotTools._RemoveAndStorePivotPoint(this.attachedNode);
                // Slowly move mesh to avoid jitter
                this._targetPosition.subtractToRef(this.attachedNode.absolutePosition, this._tmpVector);
                this._tmpVector.scaleInPlace(this.dragDeltaRatio);
                this.attachedNode.getAbsolutePosition().addToRef(this._tmpVector, this._tmpVector);
                if (this.validateDrag(this._tmpVector)) {
                    this.attachedNode.setAbsolutePosition(this._tmpVector);
                    needMatrixUpdate = true;
                }
                PivotTools._RestorePivotPoint(this.attachedNode);
                if (needMatrixUpdate) {
                    this.attachedNode.computeWorldMatrix();
                }
            }
        });
    }

    /**
     * Force release the drag action by code.
     */
    public releaseDrag() {
        if (this.dragging) {
            this.dragging = false;
            this.onDragEndObservable.notifyObservers({ dragPlanePoint: this.lastDragPosition, pointerId: this.currentDraggingPointerId, pointerInfo: this._activePointerInfo });
        }

        this.currentDraggingPointerId = -1;
        this._activeDragButton = -1;
        this._activePointerInfo = null;
        this._moving = false;

        // Reattach camera controls
        if (this.detachCameraControls && this._attachedToElement && this._scene.activeCamera && !this._scene.activeCamera.leftCamera) {
            if (this._scene.activeCamera.getClassName() === "ArcRotateCamera") {
                const arcRotateCamera = this._scene.activeCamera as ArcRotateCamera;
                arcRotateCamera.attachControl(
                    arcRotateCamera.inputs ? arcRotateCamera.inputs.noPreventDefault : true,
                    arcRotateCamera._useCtrlForPanning,
                    arcRotateCamera._panningMouseButton
                );
            } else {
                this._scene.activeCamera.attachControl(this._scene.activeCamera.inputs ? this._scene.activeCamera.inputs.noPreventDefault : true);
            }
            this._attachedToElement = false;
        }
    }

    private _startDragRay = new Ray(new Vector3(), new Vector3());
    private _lastPointerRay: { [key: number]: Ray } = {};
    /**
     * Simulates the start of a pointer drag event on the behavior
     * @param pointerId pointerID of the pointer that should be simulated (Default: Any mouse pointer ID)
     * @param fromRay initial ray of the pointer to be simulated (Default: Ray from camera to attached mesh)
     * @param startPickedPoint picked point of the pointer to be simulated (Default: attached mesh position)
     */
    public startDrag(pointerId: number = PointerDragBehavior._AnyMouseId, fromRay?: Ray, startPickedPoint?: Vector3) {
        this._startDrag(pointerId, fromRay, startPickedPoint);

        let lastRay = this._lastPointerRay[pointerId];
        if (pointerId === PointerDragBehavior._AnyMouseId) {
            lastRay = this._lastPointerRay[<any>Object.keys(this._lastPointerRay)[0]];
        }

        if (lastRay) {
            // if there was a last pointer ray drag the object there
            this._moveDrag(lastRay);
        }
    }

    protected _startDrag(pointerId: number, fromRay?: Ray, startPickedPoint?: Vector3) {
        if (!this._scene.activeCamera || this.dragging || !this.attachedNode) {
            return;
        }

        PivotTools._RemoveAndStorePivotPoint(this.attachedNode);
        // Create start ray from the camera to the object
        if (fromRay) {
            this._startDragRay.direction.copyFrom(fromRay.direction);
            this._startDragRay.origin.copyFrom(fromRay.origin);
        } else {
            this._startDragRay.origin.copyFrom(this._scene.activeCamera.position);
            this.attachedNode.getWorldMatrix().getTranslationToRef(this._tmpVector);
            this._tmpVector.subtractToRef(this._scene.activeCamera.position, this._startDragRay.direction);
        }

        this._updateDragPlanePosition(this._startDragRay, startPickedPoint ? startPickedPoint : this._tmpVector);

        const pickedPoint = this._pickWithRayOnDragPlane(this._startDragRay);
        if (pickedPoint) {
            this.dragging = true;
            this.currentDraggingPointerId = pointerId;
            this.lastDragPosition.copyFrom(pickedPoint);
            this.onDragStartObservable.notifyObservers({ dragPlanePoint: pickedPoint, pointerId: this.currentDraggingPointerId, pointerInfo: this._activePointerInfo });
            this._targetPosition.copyFrom(this.attachedNode.getAbsolutePosition());

            // Detatch camera controls
            if (this.detachCameraControls && this._scene.activeCamera && this._scene.activeCamera.inputs && !this._scene.activeCamera.leftCamera) {
                if (this._scene.activeCamera.inputs.attachedToElement) {
                    this._scene.activeCamera.detachControl();
                    this._attachedToElement = true;
                } else {
                    this._attachedToElement = false;
                }
            }
        } else {
            this.releaseDrag();
        }
        PivotTools._RestorePivotPoint(this.attachedNode);
    }

    private _dragDelta = new Vector3();
    protected _moveDrag(ray: Ray) {
        this._moving = true;
        const pickedPoint = this._pickWithRayOnDragPlane(ray);

        if (pickedPoint) {
            PivotTools._RemoveAndStorePivotPoint(this.attachedNode);

            if (this.updateDragPlane) {
                this._updateDragPlanePosition(ray, pickedPoint);
            }
            let dragLength = 0;
            // depending on the drag mode option drag accordingly
            if (this._options.dragAxis) {
                // Convert local drag axis to world if useObjectOrientationForDragging
                this.useObjectOrientationForDragging
                    ? Vector3.TransformCoordinatesToRef(this._options.dragAxis, this.attachedNode.getWorldMatrix().getRotationMatrix(), this._worldDragAxis)
                    : this._worldDragAxis.copyFrom(this._options.dragAxis);
                // Project delta drag from the drag plane onto the drag axis
                pickedPoint.subtractToRef(this.lastDragPosition, this._tmpVector);

                this._worldDragAxis.normalize();
                dragLength = Vector3.Dot(this._tmpVector, this._worldDragAxis);
                this._worldDragAxis.scaleToRef(dragLength, this._dragDelta);
            } else {
                dragLength = this._dragDelta.length();
                pickedPoint.subtractToRef(this.lastDragPosition, this._dragDelta);
            }
            this._targetPosition.addInPlace(this._dragDelta);
            this.onDragObservable.notifyObservers({
                dragDistance: dragLength,
                delta: this._dragDelta,
                dragPlanePoint: pickedPoint,
                dragPlaneNormal: this._dragPlane.forward,
                pointerId: this.currentDraggingPointerId,
                pointerInfo: this._activePointerInfo,
            });
            this.lastDragPosition.copyFrom(pickedPoint);

            PivotTools._RestorePivotPoint(this.attachedNode);
        }
    }

    private _pickWithRayOnDragPlane(ray: Nullable<Ray>) {
        if (!ray) {
            return null;
        }

        // Calculate angle between plane normal and ray
        let angle = Math.acos(Vector3.Dot(this._dragPlane.forward, ray.direction));
        // Correct if ray is casted from oposite side
        if (angle > Math.PI / 2) {
            angle = Math.PI - angle;
        }

        // If the angle is too perpendicular to the plane pick another point on the plane where it is looking
        if (this.maxDragAngle > 0 && angle > this.maxDragAngle) {
            if (this._useAlternatePickedPointAboveMaxDragAngle) {
                // Invert ray direction along the towards object axis
                this._tmpVector.copyFrom(ray.direction);
                this.attachedNode.absolutePosition.subtractToRef(ray.origin, this._alternatePickedPoint);
                this._alternatePickedPoint.normalize();
                this._alternatePickedPoint.scaleInPlace(this._useAlternatePickedPointAboveMaxDragAngleDragSpeed * Vector3.Dot(this._alternatePickedPoint, this._tmpVector));
                this._tmpVector.addInPlace(this._alternatePickedPoint);

                // Project resulting vector onto the drag plane and add it to the attached nodes absolute position to get a picked point
                const dot = Vector3.Dot(this._dragPlane.forward, this._tmpVector);
                this._dragPlane.forward.scaleToRef(-dot, this._alternatePickedPoint);
                this._alternatePickedPoint.addInPlace(this._tmpVector);
                this._alternatePickedPoint.addInPlace(this.attachedNode.absolutePosition);
                return this._alternatePickedPoint;
            } else {
                return null;
            }
        }

        // use an infinite plane instead of ray picking a mesh that must be updated every frame
        const planeNormal = this._dragPlane.forward;
        const planePosition = this._dragPlane.position;
        const dotProduct = ray.direction.dot(planeNormal);
        if (Math.abs(dotProduct) < Epsilon) {
            // Ray and plane are parallel, no intersection
            return null;
        }

        planePosition.subtractToRef(ray.origin, TmpVectors.Vector3[0]);
        const t = TmpVectors.Vector3[0].dot(planeNormal) / dotProduct;
        // Ensure the intersection point is in front of the ray (t must be positive)
        if (t < 0) {
            // Intersection point is behind the ray
            return null;
        }

        // Calculate the intersection point using the parameter t
        ray.direction.scaleToRef(t, TmpVectors.Vector3[0]);
        const intersectionPoint = ray.origin.add(TmpVectors.Vector3[0]);
        return intersectionPoint;
    }

    // Variables to avoid instantiation in the below method
    private _pointA = new Vector3(0, 0, 0);
    private _pointC = new Vector3(0, 0, 0);
    private _localAxis = new Vector3(0, 0, 0);
    private _lookAt = new Vector3(0, 0, 0);
    // Position the drag plane based on the attached mesh position, for single axis rotate the plane along the axis to face the camera
    private _updateDragPlanePosition(ray: Ray, dragPlanePosition: Vector3) {
        this._pointA.copyFrom(dragPlanePosition);
        if (this._options.dragAxis) {
            this.useObjectOrientationForDragging
                ? Vector3.TransformCoordinatesToRef(this._options.dragAxis, this.attachedNode.getWorldMatrix().getRotationMatrix(), this._localAxis)
                : this._localAxis.copyFrom(this._options.dragAxis);

            // Calculate plane normal that is the cross product of local axis and (eye-dragPlanePosition)
            ray.origin.subtractToRef(this._pointA, this._pointC);
            this._pointC.normalize();
            if (Math.abs(Vector3.Dot(this._localAxis, this._pointC)) > 0.999) {
                // the drag axis is colinear with the (eye to position) ray. The cross product will give jittered values.
                // A new axis vector need to be computed
                if (Math.abs(Vector3.Dot(Vector3.UpReadOnly, this._pointC)) > 0.999) {
                    this._lookAt.copyFrom(Vector3.Right());
                } else {
                    this._lookAt.copyFrom(Vector3.UpReadOnly);
                }
            } else {
                Vector3.CrossToRef(this._localAxis, this._pointC, this._lookAt);
                // Get perpendicular line from previous result and drag axis to adjust lineB to be perpendicular to camera
                Vector3.CrossToRef(this._localAxis, this._lookAt, this._lookAt);
                this._lookAt.normalize();
            }

            this._dragPlane.position.copyFrom(this._pointA);
            this._pointA.addToRef(this._lookAt, this._lookAt);
            this._dragPlane.lookAt(this._lookAt);
        } else if (this._options.dragPlaneNormal) {
            this.useObjectOrientationForDragging
                ? Vector3.TransformCoordinatesToRef(this._options.dragPlaneNormal, this.attachedNode.getWorldMatrix().getRotationMatrix(), this._localAxis)
                : this._localAxis.copyFrom(this._options.dragPlaneNormal);
            this._dragPlane.position.copyFrom(this._pointA);
            this._pointA.addToRef(this._localAxis, this._lookAt);
            this._dragPlane.lookAt(this._lookAt);
        } else {
            if (this._scene.activeCamera) {
                this._scene.activeCamera.getForwardRay().direction.normalizeToRef(this._localAxis);
            }
            this._dragPlane.position.copyFrom(this._pointA);
            this._dragPlane.lookAt(this._pointA.add(this._localAxis));
        }
        // Update the position of the drag plane so it doesn't get out of sync with the node (eg. when moving back and forth quickly)
        this._dragPlane.position.copyFrom(this.attachedNode.getAbsolutePosition());

        this._dragPlane.computeWorldMatrix(true);
    }

    /**
     *  Detaches the behavior from the mesh
     */
    public detach(): void {
        this._lastPointerRay = {};
        if (this.attachedNode) {
            this.attachedNode.isNearGrabbable = false;
        }
        if (this._pointerObserver) {
            this._scene.onPointerObservable.remove(this._pointerObserver);
        }
        if (this._beforeRenderObserver) {
            this._scene.onBeforeRenderObservable.remove(this._beforeRenderObserver);
        }
        if (this._dragPlane) {
            this._dragPlane.dispose();
        }
        this.releaseDrag();
    }
}
