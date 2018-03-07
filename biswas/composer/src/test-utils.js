'use strict';

const path = require('path');

const AdminConnection = require('composer-admin').AdminConnection;
const BusinessNetworkConnection = require('composer-client').BusinessNetworkConnection;
const { CertificateUtil, IdCard, BusinessNetworkDefinition } = require('composer-common');

const utils = require('./utils');

const constants = {
    growerNamespace: 'biswas.grower',
    producerNamespace: 'biswas.producer',
    growerName: 'Grower1',
    producerName: 'Producer1'
};

async function createAdminIdentity(cardStore, name) {
    // Embedded connection used for local testing
    const connectionProfile = {
        name: 'embedded',
        'x-type': 'embedded',
        businessNetwork: 'biswas'
    };
    const credentials = CertificateUtil.generate({ commonName: 'admin' });

    // PeerAdmin identity used with the admin connection to deploy business networks
    const deployerMetadata = {
        version: 1,
        userName: name,
        roles: ['PeerAdmin', 'ChannelAdmin']
    };
    const deployerCard = new IdCard(deployerMetadata, connectionProfile);
    deployerCard.setCredentials(credentials);

    const deployerCardName = name;
    let adminConnection = new AdminConnection({ cardStore: cardStore });

    await adminConnection.importCard(deployerCardName, deployerCard);
    await adminConnection.connect(deployerCardName);
    return adminConnection;
}

async function deployNetwork(cardStore, adminConnection) {
    let businessNetworkConnection = new BusinessNetworkConnection({
        cardStore: cardStore
    });

    const adminUserName = 'admin';

    const bnd = await BusinessNetworkDefinition.fromDirectory(path.resolve(__dirname, '..'));
    await adminConnection.install(bnd.getName());
    const adminCards = await adminConnection.start(bnd, {
        networkAdmins: [
            {
                userName: adminUserName,
                enrollmentSecret: 'adminpw'
            }
        ]
    });

    const adminCardName = `${adminUserName}@${bnd.getName()}`;
    await adminConnection.importCard(adminCardName, adminCards.get(adminUserName));
    await businessNetworkConnection.connect(adminCardName);

    return businessNetworkConnection;
}

async function clearWallet(adminConnection) {
    const cards = await adminConnection.getAllCards();
    for (let [cardName, _] of cards) {
        await adminConnection.deleteCard(cardName);
    }
}

async function setupParticipants(adminConnection, businessNetworkConnection) {
    let fac = businessNetworkConnection.getBusinessNetwork().getFactory();

    // Create resources
    const vineyard = fac.newResource(constants.growerNamespace, 'Vineyard', 'vyard_001');
    vineyard.altitude = 100;
    vineyard.location = fac.newConcept(constants.growerNamespace, 'Location');
    vineyard.location.latitude = 0.0;
    vineyard.location.longitude = 0.0;
    await utils.addAsset(businessNetworkConnection, constants.growerNamespace, 'Vineyard', vineyard);

    const grower = await utils.addUsableParticipant(
        adminConnection,
        businessNetworkConnection,
        constants.growerNamespace,
        'GrapeGrower',
        constants.growerName,
        {
            email: 'string@grower.com',
            vineyards: [vineyard]
        }
    );

    const producer = await utils.addUsableParticipant(
        adminConnection,
        businessNetworkConnection,
        constants.producerNamespace,
        'WineProducer',
        constants.producerName,
        {
            email: 'string@producer.com'
        }
    );

    return {
        vineyard,
        grower,
        producer
    };
}

module.exports = {
    createAdminIdentity,
    deployNetwork,
    clearWallet,
    constants,
    setupParticipants
};
