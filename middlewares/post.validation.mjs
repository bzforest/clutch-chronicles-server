export const postValidation = (req,res,next) => {

    const { title , image , category_id , description , content , status_id } = req.body;

    if (!title || typeof title !== "string") {
        return res.status(400).json({
            message: "Invalid or missing title (Must be String)"
        })
    }

    if (!image || typeof image !== "string") {
        return res.status(400).json({
            message: "Invalid or missing image (Must be String)"
        })
    }

    if (!category_id || typeof category_id !== "number") {
        return res.status(400).json({
            message: "Invalid or missing category_id (Must be Number)"
        })
    }

    if (!description || typeof description !== "string") {
        return res.status(400).json({
            message: "Invalid or missing description (Must be String)"
        })
    }

    if (!content || typeof content !== "string") {
        return res.status(400).json({
            message: "Invalid or missing content (Must be String)"
        })
    }

    if (!status_id || typeof status_id !== "number") {
        return res.status(400).json({
            message: "Invalid or missing status_id (Must be Number)"
        })
    }

    next();
}