#if defined(ENVIRONMENTBRDF) && !defined(REFLECTIONMAP_SKYBOX)
    var specularEnvironmentReflectance: vec3f = getReflectanceFromBRDFWithEnvLookup(clearcoatOut.specularEnvironmentR0, specularEnvironmentR90, uniforms.vReflectivityColor.b, environmentBrdf);

    #ifdef RADIANCEOCCLUSION
        specularEnvironmentReflectance *= seo;
    #endif

    #ifdef HORIZONOCCLUSION
        #ifdef BUMP
            #ifdef REFLECTIONMAP_3D
                specularEnvironmentReflectance *= eho;
            #endif
        #endif
    #endif
#else
    // Jones implementation of a well balanced fast analytical solution.
    var specularEnvironmentReflectance: vec3f = getReflectanceFromAnalyticalBRDFLookup_Jones(NdotV, clearcoatOut.specularEnvironmentR0, specularEnvironmentR90, sqrt(microSurface));
#endif

#ifdef CLEARCOAT
    specularEnvironmentReflectance *= clearcoatOut.conservationFactor;

    #if defined(CLEARCOAT_TINT)
        specularEnvironmentReflectance *= clearcoatOut.absorption;
    #endif
#endif
