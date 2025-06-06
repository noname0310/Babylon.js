// Samplers
varying vUV: vec2f;


var textureSamplerSampler: sampler;
var textureSampler: texture_2d<f32>;
uniform motionStrength: f32;
uniform motionScale: f32;
uniform screenSize: vec2f;

#ifdef OBJECT_BASED
var velocitySamplerSampler: sampler;
var velocitySampler: texture_2d<f32>;
#else
var depthSamplerSampler: sampler;
var depthSampler: texture_2d<f32>;

uniform inverseViewProjection: mat4x4f;
uniform prevViewProjection: mat4x4f;
uniform projection: mat4x4f;
#endif


#define CUSTOM_FRAGMENT_DEFINITIONS

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    #ifdef GEOMETRY_SUPPORTED
        #ifdef OBJECT_BASED
            var texelSize: vec2f = 1.0 / uniforms.screenSize;
            var velocityColor: vec4f = textureSampleLevel(velocitySampler, velocitySamplerSampler, input.vUV, 0.0);
            velocityColor = vec4f(velocityColor.rg * 2.0 -  vec2f(1.0), velocityColor.b, velocityColor.a);
            let signs = sign(velocityColor.rg);
            var velocity = pow(abs(velocityColor.rg), vec2f(3.0)) * signs * velocityColor.a;
            velocity *= uniforms.motionScale * uniforms.motionStrength;
            var speed: f32 = length(velocity / texelSize);
            var samplesCount: i32 =  i32(clamp(speed, 1.0, SAMPLES));

            velocity = normalize(velocity) * texelSize;
            var hlim: f32 =  f32(-samplesCount) * 0.5 + 0.5;

            var result: vec4f = textureSampleLevel(textureSampler, textureSamplerSampler,  input.vUV, 0.0);

            for (var i: i32 = 1; i <  i32(SAMPLES); i++)
            {
                if (i >= samplesCount) {
                    break;
                }
                
                var offset: vec2f = input.vUV + velocity * (hlim +  f32(i));
                result += textureSampleLevel(textureSampler, textureSamplerSampler,  offset, 0.0);
            }

            fragmentOutputs.color = vec4f(result.rgb /  f32(samplesCount), 1.0);
        #else
            var result: vec4f = textureSampleLevel(textureSampler, textureSamplerSampler,  input.vUV, 0.0);

            var texelSize: vec2f = 1.0 / uniforms.screenSize;
            var depth: f32 = textureSampleLevel(depthSampler, depthSamplerSampler, input.vUV, 0.0).r;
            if (depth == 0.0) {
                fragmentOutputs.color = result;
                return fragmentOutputs;
            }

            depth = uniforms.projection[2].z + uniforms.projection[3].z / depth; // convert from view linear z to NDC z

            var cpos: vec4f =  vec4f(input.vUV * 2.0 - 1.0, depth, 1.0);
            cpos = uniforms.inverseViewProjection * cpos;
            cpos /= cpos.w;

            var ppos: vec4f = uniforms.prevViewProjection * cpos;
            ppos /= ppos.w;
            ppos = vec4f(ppos.xy * 0.5 + 0.5, ppos.zw);

            var velocity: vec2f = (ppos.xy - input.vUV) * uniforms.motionScale * uniforms.motionStrength;
            var speed: f32 = length(velocity / texelSize);
            var nSamples: i32 =  i32(clamp(speed, 1.0, SAMPLES));

            for (var i: i32 = 1; i <  i32(SAMPLES); i++) {
                if (i >= nSamples) {
                    break;
                }
                
                var offset1: vec2f = input.vUV + velocity * ( f32(i) /  f32(nSamples - 1) - 0.5);
                result += textureSampleLevel(textureSampler, textureSamplerSampler,  offset1, 0.0);
            }

            fragmentOutputs.color = result /  f32(nSamples);
        #endif
    #else
    fragmentOutputs.color = textureSample(textureSampler, textureSamplerSampler,  input.vUV);
    #endif
}
