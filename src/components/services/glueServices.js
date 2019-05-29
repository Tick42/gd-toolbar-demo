/**
 * Copyright © 2014-2019 Tick42 OOD
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

angular
    .module('clientContext.glue', [])
    .factory('glueService', [async function  () {

        const startConfig = {
            layouts: { mode: 'full' }, // we need full layouts
            appManager: { mode: 'full' }, // we need full app-manager
            activities: true, // turn off activities we don't need it
            gateway: {
                ws: 'ws://localhost:22037',
                protocolVersion: 1
            }
        }

        const glue42gd = window.glue42gd || window.gd;

        if (glue42gd) {
            startConfig.gateway = {
                ws: glue42gd.gwURL || glue42gd.context.gateway,
                protocolVersion: 3
            };

            let token = await glue42gd.getGWToken();

            startConfig.auth = {
                gatewayToken: token
            };

            startConfig.application = "AppManager";

            console.log(startConfig);
        }

        const initializeGlue = () => {
            let gssPromise;

            const gluePromise = Glue(startConfig)
                .then(glue => {
                    window.glue = glue;

                    return new Promise((resolve, reject) => {
                        if (!glue) {
                            console.log('Can\'t initialize Glue');
                            return reject(null);
                        }

                        gssPromise = new gss.GlueSearchService(glue.agm);

                        console.log('Initialized Glue');
                        return resolve(glue);
                    });
                })
                .catch(console.error);

            return gluePromise
                .then(glue => {
                    if (!glue) {
                        return;
                    }

                    return { glue: window.glue, gss: window.gss };
                })
                .catch(console.error);
        };

        const getGlueInstance = () => {
            if (!window.glue) {
                return initializeGlue();
            }

            return Promise.resolve({ glue: window.glue, gss: window.gss });
        };

        return getGlueInstance();
    }]);