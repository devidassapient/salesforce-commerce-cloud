'use strict';

var StringUtils = require('dw/util/StringUtils');
var URLUtils = require('dw/web/URLUtils');
var server = require('server');

/**
 * Method to evaluate Pay By link when redirect URL is sent to shopper Email Id after proceeding to payment on success return.
 * @param {Object} handlePaymentResult - Authorization Result
 * @param {Order} order - Order
 * @param {Object} options - Options Object
 * @returns {Object} - object
 */
function processPayByLink(handlePaymentResult, order, options) {
    var utils = require('*/cartridge/scripts/common/utils');
    var OrderMgr = require('dw/order/OrderMgr');
    var Transaction = require('dw/system/Transaction');
    var Status = require('dw/system/Status');
    var Resource = require('dw/web/Resource');
    var req = options.req;
    var billingForm = server.forms.getForm('billing');
    if (req.httpParameterMap.payByLink && req.httpParameterMap.payByLink.value) {
        Transaction.begin();
        let placeOrderStatus = OrderMgr.placeOrder(order);
        if (placeOrderStatus === Status.ERROR) {
            Transaction.rollback();
            return {
                error: true,
                form: billingForm,
                fieldErrors: {},
                serverErrors: {},
                errorMessage: Resource.msg('pay.by.link.failure', 'worldpay', null)
            };
        }
        Transaction.commit();
        utils.sendPayByLinkNotification(order.orderNo, handlePaymentResult.redirectUrl, order.customerEmail);
        return {
            error: true,
            successMessage: Resource.msg('pay.by.link.success', 'worldpay', null)
        };
    }
    return null;
}

/**
 * This function is used to handle the post payment authorization customizations
 * @param {Object} handlePaymentResult - Authorization Result
 * @param {Order} order - Order
 * @param {Object} options - Options Object
 * @returns {Object} - object
 */
function postAuthorization(handlePaymentResult, order, options) {
    var req = options.req;
    var billingForm = server.forms.getForm('billing');
    if (handlePaymentResult.error) {
        return {
            error: true,
            form: billingForm,
            fieldErrors: handlePaymentResult.fieldErrors,
            serverErrors: handlePaymentResult.serverErrors,
            errorMessage: handlePaymentResult.serverErrors ? handlePaymentResult.serverErrors : handlePaymentResult.errorMessage
        };
    } else if (handlePaymentResult.redirect && handlePaymentResult.isValidCustomOptionsHPP) {
        let result = processPayByLink(handlePaymentResult, order, options);
        if (result) {
            return result;
        }
        return {
            error: true,
            orderID: order.orderNo,
            orderToken: order.orderToken,
            continueUrl: handlePaymentResult.redirectUrl,
            isValidCustomOptionsHPP: handlePaymentResult.isValidCustomOptionsHPP,
            customOptionsHPPJSON: StringUtils.decodeString(handlePaymentResult.customOptionsHPPJSON, StringUtils.ENCODE_TYPE_HTML),
            libraryObjectSetup: '<script type="text/javascript">var libraryObject = new WPCL.Library();libraryObject.setup(' +
                StringUtils.decodeString(handlePaymentResult.customOptionsHPPJSON, StringUtils.ENCODE_TYPE_HTML) + ');</script>'
        };
    } else if (handlePaymentResult.redirect && handlePaymentResult.isKlarna) {
        return {
            error: true,
            orderID: order.orderNo,
            orderToken: order.orderToken,
            continueUrl: handlePaymentResult.redirectUrl,
            isKlarna: handlePaymentResult.isKlarna,
            klarnasnippet: handlePaymentResult.klarnasnippet
        };
    } else if (handlePaymentResult.worldpayredirect) {
        let result = processPayByLink(handlePaymentResult, order, options);
        if (result) {
            return result;
        }
        return {
            error: true,
            cartError: true,
            redirectUrl: handlePaymentResult.redirectUrl
        };
    } else if (handlePaymentResult.redirect) {
        return {
            error: false,
            orderID: order.orderNo,
            orderToken: order.orderToken,
            continueUrl: handlePaymentResult.redirectUrl
        };
    } else if (handlePaymentResult.is3D) {
        req.session.privacyCache.set('echoData', handlePaymentResult.echoData);
        return {
            error: false,
            orderID: order.orderNo,
            orderToken: order.orderToken,
            continueUrl: URLUtils.url('Worldpay-Worldpay3D', 'IssuerURL', handlePaymentResult.redirectUrl, 'PaRequest', handlePaymentResult.paRequest, 'TermURL',
                handlePaymentResult.termUrl, 'MD', handlePaymentResult.orderNo).toString()
        };
    } else if (handlePaymentResult.threeDSVersion) {
        return {
            error: false,
            orderID: order.orderNo,
            orderToken: order.orderToken,
            continueUrl: URLUtils.url('Worldpay-Worldpay3DS2', 'acsURL', handlePaymentResult.acsURL, 'payload', handlePaymentResult.payload, 'threeDSVersion',
                handlePaymentResult.threeDSVersion, 'transactionId3DS', handlePaymentResult.transactionId3DS).toString()
        };
    }
    return {};
}

module.exports = {
    postAuthorization: postAuthorization
};
